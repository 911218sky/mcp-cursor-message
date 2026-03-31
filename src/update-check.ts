import * as https from "node:https";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as vscode from "vscode";

type UpdateCheckLatestRelease = {
	tag_name?: string;
	html_url?: string;
	assets?: { name?: string; browser_download_url?: string }[];
};

function resolveUiLocale(): "en" | "zh" {
	const cfg = vscode.workspace.getConfiguration("mcpMessenger");
	const mode = cfg.get<string>("uiLanguage", "en");
	if (mode === "en" || mode === "zh") return mode;
	const lang = vscode.env.language.toLowerCase();
	if (lang.startsWith("en")) return "en";
	return "zh";
}

function parseSemverTriplet(v: string): [number, number, number] | null {
	const s = v.trim().replace(/^v/i, "");
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewerVersion(candidate: string, current: string): boolean {
	const a = parseSemverTriplet(candidate);
	const b = parseSemverTriplet(current);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) {
		if (a[i] > b[i]) return true;
		if (a[i] < b[i]) return false;
	}
	return false;
}

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
	if (!enabled && !opts.force) return;

	const repo = cfg.get<string>("updateCheck.repo", "911218sky/mcp-cursor-message").trim();
	if (!repo.includes("/")) return;

	const currentVersion = String(context.extension.packageJSON?.version ?? "").trim();
	if (!currentVersion) return;

	const latest = await fetchLatestRelease(repo);
	const latestTag = String(latest?.tag_name ?? "").trim();
	if (!latestTag) return;

	if (!isNewerVersion(latestTag, currentVersion)) {
		if (opts.force) {
			void vscode.window.showInformationMessage(t.upToDate(currentVersion, latestTag));
		}
		return;
	}

	const lastNotified = context.globalState.get<string>("updateCheck.lastNotifiedVersion");
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
		await context.globalState.update("updateCheck.lastNotifiedVersion", latestTag);
		await installVsixAndReload(dest);
	}
}

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

