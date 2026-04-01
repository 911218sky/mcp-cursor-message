import * as https from "node:https";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as vscode from "vscode";

/**
 * 我們實際會用到的 GitHub「最新 Release」API 回應最小結構。
 *
 * 這裡刻意只保留最小欄位，目的是：
 * - 降低對 GitHub 完整 schema 的耦合
 * - 清楚呈現更新提示流程真正依賴的資料
 */
type UpdateCheckLatestRelease = {
	tag_name?: string;
	html_url?: string;
	assets?: { name?: string; browser_download_url?: string }[];
};

/**
 * 決定更新提示使用的語系。
 *
 * 優先順序：
 * - 使用者設定 `mcpMessenger.uiLanguage`（明確覆寫）
 * - VS Code 介面語系（回退：非英文語系一律視為中文）
 *
 * 註：此處只支援 `en`/`zh`，以維持字串與 UX 一致性。
 */
function resolveUiLocale(): "en" | "zh" {
	const cfg = vscode.workspace.getConfiguration("mcpMessenger");
	const mode = cfg.get<string>("uiLanguage", "en");
	if (mode === "en" || mode === "zh") return mode;
	const lang = vscode.env.language.toLowerCase();
	if (lang.startsWith("en")) return "en";
	return "zh";
}

/**
 * 從版本字串解析出 SemVer 三段式版本 \(MAJOR.MINOR.PATCH\)。
 *
 * 支援前綴 `v`/`V`（例如 `v1.2.3`），並忽略後綴（例如 `1.2.3-beta`），
 * 因為 Release tag 與 extension 版本可能帶有這些格式。
 *
 * 若字串開頭不是三段式 SemVer，則回傳 `null`。
 */
function parseSemverTriplet(v: string): [number, number, number] | null {
	const s = v.trim().replace(/^v/i, "");
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * 以 SemVer 三段式版本做大小比較。
 *
 * 這裡刻意不實作完整 SemVer precedence（例如 prerelease/build），
 * 因為此功能只需要可靠的「是否有更新的 Release tag」判斷。
 * 若任一方解析失敗，則一律視為「不更新」，避免誤判造成不必要提示。
 */
function isNewerVersionFull(candidate: string, current: string): boolean {
	const a = parseSemverTriplet(candidate);
	const b = parseSemverTriplet(current);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) {
		if (a[i] > b[i]) return true;
		if (a[i] < b[i]) return false;
	}
	return false;
}

/**
 * 在已判定 `candidate` 較新後，依 **SemVer bump** 粒度決定是否仍要提示更新。
 * - `patch`：一律提示（任何 PATCH／MINOR／MAJOR 遞增）
 * - `minor`：僅 MINOR 或 MAJOR 遞增（略過「僅 PATCH」）
 * - `major`：僅 MAJOR 遞增
 */
function passesSemverBumpPolicy(
	candidate: string,
	current: string,
	policy: "patch" | "minor" | "major"
): boolean {
	if (policy === "patch") return true;
	const a = parseSemverTriplet(candidate);
	const b = parseSemverTriplet(current);
	if (!a || !b) return true;
	if (policy === "major") return a[0] > b[0];
	// minor: same as "preminor-or-higher" — major up, or same major with minor up
	if (a[0] > b[0]) return true;
	if (a[0] < b[0]) return false;
	return a[1] > b[1];
}

/**
 * 取得 GitHub 指定 Repo（`owner/name`）的最新 Release 資訊。
 *
 * 說明：
 * - 直接使用 Node 的 `https`，避免在 extension 引入額外依賴
 * - 任一 HTTP 非 2xx / 網路錯誤 / JSON 解析錯誤都回傳 `null`，讓更新檢查永遠不影響主要功能
 */
async function fetchLatestRelease(repo: string): Promise<UpdateCheckLatestRelease | null> {
	return await new Promise((resolve) => {
		const url = `https://api.github.com/repos/${repo}/releases/latest`;
		const req = https.request(
			url,
			{
				method: "GET",
				headers: {
					"User-Agent": "mcp-cursor-message-vscode-extension",
					Accept: "application/vnd.github+json",
				},
			},
			(res) => {
				const code = res.statusCode ?? 0;
				if (code < 200 || code >= 300) {
					res.resume();
					resolve(null);
					return;
				}
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (c) => (raw += String(c)));
				res.on("end", () => {
					try {
						resolve(JSON.parse(raw) as UpdateCheckLatestRelease);
					} catch {
						resolve(null);
					}
				});
			}
		);
		req.on("error", () => resolve(null));
		req.end();
	});
}

/**
 * 從 Release 的 assets 中挑選第一個 `.vsix` 檔。
 *
 * 不針對平台/架構做篩選，因為 VSIX 對 VS Code 而言通常是可攜的發佈格式。
 */
function pickVsixAsset(r: UpdateCheckLatestRelease): { name: string; url: string } | null {
	const assets = Array.isArray(r.assets) ? r.assets : [];
	for (const a of assets) {
		const name = String(a?.name ?? "");
		const url = String(a?.browser_download_url ?? "");
		if (!name || !url) continue;
		if (name.toLowerCase().endsWith(".vsix")) return { name, url };
	}
	return null;
}

/**
 * 下載檔案到 `dest`，採用「暫存檔 + 原子性 rename」策略。
 *
 * 理由：
 * - 暫存檔可避免留下半成品 VSIX
 * - rename 在多數平台/檔案系統上具原子性，可降低檔案毀損風險
 *
 * 下載過程允許有限次數的 redirect（有些 release asset 下載會出現 redirect chain）。
 */
async function downloadToFile(url: string, dest: string): Promise<boolean> {
	await fs.mkdir(path.dirname(dest), { recursive: true });
	const tmp = dest + ".tmp";

	const download = async (u: string, depth: number): Promise<boolean> => {
		if (depth > 5) return false;

		return await new Promise((resolve) => {
			const fileStream = fs
				.open(tmp, "w")
				.then((fh) => fh.createWriteStream())
				.catch(() => null);

			void (async () => {
				const ws = await fileStream;
				if (!ws) {
					resolve(false);
					return;
				}
				const req = https.get(
					u,
					{
						headers: {
							"User-Agent": "mcp-cursor-message-vscode-extension",
							Accept: "application/octet-stream",
						},
					},
					(res) => {
						const code = res.statusCode ?? 0;
						if ([301, 302, 303, 307, 308].includes(code)) {
							const loc = String(res.headers.location ?? "").trim();
							res.resume();
							ws.close();
							// redirect 處理採「顯式 + 有上限」以避免陷入無限循環。
							if (!loc) {
								resolve(false);
								return;
							}
							void download(loc, depth + 1).then(resolve);
							return;
						}
						if (code < 200 || code >= 300) {
							res.resume();
							ws.close();
							resolve(false);
							return;
						}
						res.pipe(ws);
						ws.on("finish", async () => {
							try {
								ws.close();
								await fs.rename(tmp, dest);
								resolve(true);
							} catch {
								resolve(false);
							}
						});
					}
				);
				req.on("error", () => resolve(false));
			})();
		});
	};

	return await download(url, 0);
}

/**
 * 安裝 VSIX，並提示使用者重新載入視窗以套用新版本。
 *
 * 透過 VS Code 內建指令安裝，讓簽章/extension 管理行為與編輯器原生流程一致。
 */
async function installVsixAndReload(vsixPath: string): Promise<void> {
	const ui = resolveUiLocale();
	const t =
		ui === "zh"
			? {
					installed:
						"已下載並安裝更新。需要重新載入視窗以套用新版。",
					reload: "重新載入視窗",
			  }
			: {
					installed:
						"Update downloaded and installed. Reload the window to apply the new version.",
					reload: "Reload window",
			  };

	await vscode.commands.executeCommand(
		"workbench.extensions.installExtension",
		vscode.Uri.file(vsixPath)
	);
	const pick = await vscode.window.showInformationMessage(
		t.installed,
		t.reload
	);
	if (pick === t.reload) {
		await vscode.commands.executeCommand("workbench.action.reloadWindow");
	}
}

/**
 * 執行更新檢查，並引導使用者下載/安裝更新。
 *
 * 行為：
 * - 從 `mcpMessenger.updateCheck.repo` 讀取 `releases/latest`
 * - 與目前正在執行的 extension 版本比較
 * - 將最後一次提示的版本寫入 `globalState`，避免重複跳出相同提示
 *
 * 相關設定：
 * - `mcpMessenger.updateCheck.enabled`：`false` 時不檢查（含手動）；手動時提示
 * - `mcpMessenger.updateCheck.repo`：GitHub repo，格式為 `owner/name`
 * - `mcpMessenger.updateCheck.versionCompare`：`patch` | `minor` | `major` | `off`（背景粒度；手動略過 patch/minor/major）
 *
 * `opts.force`（手動檢查）：略過 `versionCompare` 的 patch/minor/major 篩選與「同版不重複提示」；仍受 `enabled` 與 `off` 影響。
 */
export async function runUpdateCheck(
	context: vscode.ExtensionContext,
	opts: { force: boolean }
): Promise<void> {
	const ui = resolveUiLocale();
	const t =
		ui === "zh"
			? {
					upToDate: (cur: string, latest: string) =>
						`已是最新版（目前 ${cur}，GitHub 最新 ${latest}）。`,
					updateAvailable: (latest: string, cur: string) =>
						`mcp-cursor-message 有新版本可用：${latest}（目前 ${cur}）。是否要更新？`,
					actionInstall: "下載並安裝",
					actionRelease: "查看更新內容",
					actionSkip: "此版本不再提示",
					downloadFailed: "下載更新失敗，請稍後再試。",
			  }
			: {
					upToDate: (cur: string, latest: string) =>
						`You're up to date (current ${cur}, GitHub latest ${latest}).`,
					updateAvailable: (latest: string, cur: string) =>
						`Update available for mcp-cursor-message: ${latest} (current ${cur}). Update now?`,
					actionInstall: "Download & install",
					actionRelease: "Release notes",
					actionSkip: "Don't show again (this version)",
					downloadFailed: "Failed to download update. Please try again later.",
			  };

	const cfg = vscode.workspace.getConfiguration("mcpMessenger");
	const enabled = cfg.get<boolean>("updateCheck.enabled", true);
	let vcRaw = cfg.get<string>("updateCheck.versionCompare", "minor").trim();
	// 舊版 enum：full / majorMinor
	if (vcRaw === "full") vcRaw = "patch";
	else if (vcRaw === "majorMinor") vcRaw = "minor";

	const versionPolicy: "patch" | "minor" | "major" | "off" =
		vcRaw === "off"
			? "off"
			: vcRaw === "major"
				? "major"
				: vcRaw === "patch"
					? "patch"
					: "minor";

	if (!enabled || versionPolicy === "off") {
		if (opts.force) {
			void vscode.window.showInformationMessage(
				ui === "zh"
					? "更新檢查已關閉：請啟用 mcpMessenger.updateCheck.enabled，且勿將 versionCompare 設為 off。"
					: "Update checks are off: enable mcpMessenger.updateCheck.enabled and set versionCompare to something other than off."
			);
		}
		return;
	}

	const bumpPolicy: "patch" | "minor" | "major" = versionPolicy;

	const repo = cfg.get<string>("updateCheck.repo", "911218sky/mcp-cursor-message").trim();
	// 避免送出無效 repo 字串造成不必要的請求；此值可由使用者自行設定。
	if (!repo.includes("/")) return;

	const currentVersion = String(context.extension.packageJSON?.version ?? "").trim();
	if (!currentVersion) return;

	const latest = await fetchLatestRelease(repo);
	const latestTag = String(latest?.tag_name ?? "").trim();
	if (!latestTag) return;

	if (!isNewerVersionFull(latestTag, currentVersion)) {
		if (opts.force) {
			void vscode.window.showInformationMessage(t.upToDate(currentVersion, latestTag));
		}
		return;
	}

	// 背景檢查才套用 patch/minor/major；手動「Check for updates」略過。
	if (
		!opts.force &&
		!passesSemverBumpPolicy(latestTag, currentVersion, bumpPolicy)
	) {
		return;
	}

	const lastNotified = context.globalState.get<string>("updateCheck.lastNotifiedVersion");
	// 同一版本只提示一次（背景）；手動檢查略過此限制。
	if (!opts.force && lastNotified === latestTag) return;

	const asset = latest ? pickVsixAsset(latest) : null;
	const releaseUrl = latest?.html_url;

	const actions: { label: string; kind: "install" | "release" | "skip" }[] = [];
	if (asset) actions.push({ label: t.actionInstall, kind: "install" });
	if (releaseUrl) actions.push({ label: t.actionRelease, kind: "release" });
	actions.push({ label: t.actionSkip, kind: "skip" });

	const pick = await vscode.window.showInformationMessage(
		t.updateAvailable(latestTag, currentVersion),
		...actions.map((a) => a.label)
	);
	const chosen = actions.find((a) => a.label === pick)?.kind;
	if (!chosen) return;

	if (chosen === "skip") {
		await context.globalState.update("updateCheck.lastNotifiedVersion", latestTag);
		return;
	}

	if (chosen === "release" && releaseUrl) {
		void vscode.env.openExternal(vscode.Uri.parse(releaseUrl));
		await context.globalState.update("updateCheck.lastNotifiedVersion", latestTag);
		return;
	}

	if (chosen === "install" && asset) {
		const dir = path.join(context.globalStorageUri.fsPath, "updates");
		const dest = path.join(dir, asset.name);
		const ok = await downloadToFile(asset.url, dest);
		if (!ok) {
			void vscode.window.showWarningMessage(t.downloadFailed);
			return;
		}
		// 下載成功後才標記已提示，避免重複下載/重複提示。
		await context.globalState.update("updateCheck.lastNotifiedVersion", latestTag);
		await installVsixAndReload(dest);
	}
}

/**
 * 依使用者設定的間隔排程背景更新檢查。
 *
 * 使用 timer 而非 VS Code tasks：
 * - 可在 UI 與較精簡的 extension 執行環境中一致運作
 * - 可透過 `context.subscriptions` 乾淨地釋放資源
 */
export function scheduleUpdateChecks(context: vscode.ExtensionContext): void {
	const cfg = vscode.workspace.getConfiguration("mcpMessenger");
	const enabled = cfg.get<boolean>("updateCheck.enabled", true);
	if (!enabled) return;
	const hours = cfg.get<number>("updateCheck.intervalHours", 12);
	const intervalMs = Math.max(1, Number.isFinite(hours) ? hours : 12) * 60 * 60 * 1000;

	const startupDelaySeconds = cfg.get<number>("updateCheck.startupDelaySeconds", 15);
	const startupDelayMs = Math.max(
		0,
		Number.isFinite(startupDelaySeconds) ? startupDelaySeconds : 15
	) * 1000;

	const firstTimer = setTimeout(
		() => void runUpdateCheck(context, { force: false }),
		startupDelayMs
	);
	const interval = setInterval(() => void runUpdateCheck(context, { force: false }), intervalMs);
	context.subscriptions.push({ dispose: () => clearTimeout(firstTimer) });
	context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

