/**
 * VS Code 擴充進入點：Webview 側欄、檔案 IPC、MCP 設定。
 */
import * as path from "node:path";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import * as vscode from "vscode";
import {
	appendQueue,
	ensureDataDir,
	readQuestion,
	readQueue,
	readReply,
	unlinkReply,
	writeAnswerFile,
} from "./ipc";
import { installMcpServer, removeMcpServer } from "./mcp-config";
import type { AnswerEntry, QueueMsg } from "./ipc-types";
import {
	readTokenStats,
	recordTokensForQueueMessage,
	resetTokenStats,
} from "./token-stats";

/** 目前 IPC 根目錄（工作區或 globalStorage 下的 messenger-data）。 */
let dataDir: string = "";
/** 停止監聽 messenger-data/*.json（工作區切換或停用時呼叫）。 */
let fileWatcherStop: (() => void) | undefined;
/** 側欄 Webview 實例，供 `pushStateToPanel` 推送狀態。 */
let panelView: vscode.WebviewView | undefined;
/** 檔案 watcher 防抖計時器，避免短時間內多次觸發重複推送。 */
let debounceTimer: NodeJS.Timeout | undefined;

/** `panel.html` 原始模板（僅 nonce／URI 每輪替換），避免 `resolveWebviewView` 重入時重複讀檔。 */
let cachedPanelHtmlTemplate: string | undefined;

/**
 * 解析 IPC 根目錄；須與 `mcp-config` 寫入 `.cursor/mcp.json` 的 `MESSENGER_DATA_DIR` 一致。
 * 有工作區：`<工作區>/.cursor/messenger-data`；無工作區：globalStorage 下的 `messenger-data`。
 */
function messengerDataDirForContext(context: vscode.ExtensionContext): string {
	const wf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (wf) {
		return path.join(wf, ".cursor", "messenger-data");
	}
	return path.join(context.globalStorageUri.fsPath, "messenger-data");
}

/** 工作區切換時更新 `dataDir`、重建 watcher、重推 Webview 狀態。 */
function rebindMessengerDataDir(context: vscode.ExtensionContext): void {
	const next = messengerDataDirForContext(context);
	if (next === dataDir) return;
	dataDir = next;
	void ensureDataDir(dataDir);
	fileWatcherStop?.();
	fileWatcherStop = undefined;
	startDataDirWatcher();
	schedulePushState();
	void autoInstallMcpIfWorkspace(context);
}

/**
 * 與手動「安裝 MCP 設定」相同邏輯，於啟動／切換工作區時靜默執行（對齊常見打包版行為）。
 * 失敗只寫 console，避免每次開啟都跳干擾訊息。
 */
function autoInstallMcpIfWorkspace(context: vscode.ExtensionContext): void {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!root) return;
	const dir = path.join(root, ".cursor", "messenger-data");
	void installMcpServer(root, context.extensionPath, dir).catch((e) => {
		console.error("[mcp-cursor-message] 自動安裝 MCP 設定失敗：", e);
	});
}

/** 擴充啟用：註冊 Webview、命令、資料夾監聽與工作區變更。 */
export function activate(context: vscode.ExtensionContext): void {
	dataDir = messengerDataDirForContext(context);
	void ensureDataDir(dataDir);

	// `getDataDir` 用函式而非固定字串：切換工作區時只改模組變數 `dataDir`，provider 永遠讀到最新路徑。
	const provider = new MessengerViewProvider(context.extensionUri, () => dataDir);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			MessengerViewProvider.viewType,
			provider,
			// true：隱藏側欄時保留 Webview，切回 Activity 視圖時不必整頁重載，可消除明顯卡頓。
			// 本擴充 webview 未註冊 Service Worker；若遇到上游 Chromium／嵌入環境的 SW 異常，可改為 false。
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("mcpMessenger.setupMcp", async () => {
			const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!root) {
				void vscode.window.showErrorMessage("請先開啟工作區資料夾再安裝 MCP 設定。");
				return;
			}
			try {
				const dir = path.join(root, ".cursor", "messenger-data");
				await installMcpServer(root, context.extensionPath, dir);
				void vscode.window.showInformationMessage(
					"已寫入 .cursor/mcp.json（MESSENGER_DATA_DIR 與工作區 .cursor/messenger-data 一致）。若 MCP 未載入，請重啟 Cursor。"
				);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				void vscode.window.showErrorMessage("寫入失敗：" + msg);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("mcpMessenger.removeMcp", async () => {
			const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!root) {
				void vscode.window.showWarningMessage("沒有工作區可移除設定。");
				return;
			}
			try {
				await removeMcpServer(root);
				void vscode.window.showInformationMessage("已自 .cursor/mcp.json 移除 MCP 條目。");
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				void vscode.window.showErrorMessage("移除失敗：" + msg);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("mcpMessenger.resetTokenStats", async () => {
			try {
				await resetTokenStats(dataDir);
				void vscode.window.showInformationMessage("已重設側欄 token 約略統計。");
				schedulePushState();
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				void vscode.window.showErrorMessage("重設失敗：" + msg);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"mcpMessenger.sendFile",
			async (uri?: vscode.Uri) => {
				const target =
					uri ?? vscode.window.activeTextEditor?.document.uri;
				const fsPath =
					target?.scheme === "file" ? target.fsPath : undefined;
				if (!fsPath) {
					void vscode.window.showWarningMessage(
						"請在檔案總管以右鍵選取檔案，或先開啟一個本機檔案。"
					);
					return;
				}
				try {
					await appendQueueWithTokenRecord(dataDir, {
						type: "file",
						path: fsPath,
					});
					void vscode.window.showInformationMessage("已加入檔案至佇列。");
					schedulePushState();
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					void vscode.window.showErrorMessage("加入佇列失敗：" + msg);
				}
			}
		)
	);

	startDataDirWatcher();

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			rebindMessengerDataDir(context);
		})
	);

	// 有工作區時靜默寫入 MCP 條目（與命令「安裝 MCP 設定」相同）；失敗只打 log。
	void autoInstallMcpIfWorkspace(context);
}

/** 監聽 `messenger-data/*.json` 變化，防抖後推送最新佇列／問答／摘要至側欄。 */
function startDataDirWatcher(): void {
	try {
		fileWatcherStop?.();
		const base = vscode.Uri.file(dataDir);
		const pattern = new vscode.RelativePattern(base, "*.json");
		const w = vscode.workspace.createFileSystemWatcher(pattern);
		// 連續寫入時只觸發一次推送，避免閃爍與重複 IO。
		const debounced = () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => schedulePushState(), 100);
		};
		w.onDidChange(debounced);
		w.onDidCreate(debounced);
		w.onDidDelete(debounced);
		fileWatcherStop = () => {
			w.dispose();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	} catch {
		/* ignore */
	}
}

/** 從 IPC 讀取問答與佇列，以 `postMessage({ type: 'state' })` 同步至 Webview。 */
async function pushStateToPanel(): Promise<void> {
	if (!panelView) return;
	const question = await readQuestion(dataDir);
	const reply = await readReply(dataDir);
	const queue = await readQueue(dataDir);
	const tokenStats = await readTokenStats(dataDir);
	void panelView.webview.postMessage({
		type: "state",
		question,
		reply: reply ? { content: reply.content } : null,
		queue,
		tokenStats,
	});
}

/** 觸發非同步 `pushStateToPanel`（供 watcher、送訊後呼叫）。 */
function schedulePushState(): void {
	void pushStateToPanel();
}

/** 寫入佇列並累加 token 約略統計（僅統計側欄送入之內容）。 */
async function appendQueueWithTokenRecord(
	dir: string,
	msg: QueueMsg
): Promise<void> {
	await appendQueue(dir, msg);
	await recordTokensForQueueMessage(dir, msg);
}

/** 釋放 watcher 與側欄面板參考。 */
function deactivateExtension(): void {
	fileWatcherStop?.();
	fileWatcherStop = undefined;
	panelView = undefined;
}

/** VS Code 擴充停用時呼叫。 */
export function deactivate(): void {
	deactivateExtension();
}

/**
 * 側欄 Webview 提供者：組出 HTML（CSP／資源 URI）、轉發網頁 `postMessage` 至 `ipc` 檔案。
 * `viewType` 須與 package.json `contributes.views` 的 id 一致。
 */
class MessengerViewProvider implements vscode.WebviewViewProvider {
	/** 與 package.json 中 `mcpMessenger.mainView` 相同，註冊 provider 時使用。 */
	static readonly viewType = "mcpMessenger.mainView";

	constructor(
		/** 擴充套件根目錄，用於載入 dist／media。 */
		private readonly extensionUri: vscode.Uri,
		/** 每次處理訊息時重新取得 IPC 目錄（工作區切換後仍正確）。 */
		private readonly getDataDir: () => string
	) {}

	/**
	 * 側欄首次顯示或需重建時由 VS Code 呼叫：設定 webview、注入 HTML、註冊訊息處理。
	 */
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		panelView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			// 僅允許從擴充目錄載入腳本與樣式（webview 沙箱）。
			localResourceRoots: [this.extensionUri],
		};
		const nonce = getNonce();
		const csp = webviewView.webview.cspSource;
		// 轉成 webview 內可用的特殊 URI，瀏覽器才能載入本機 bundle 與 CSS。
		const scriptUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
		);
		const styleUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "panel.css")
		);

		const htmlPath = path.join(
			this.extensionUri.fsPath,
			"media",
			"panel.html"
		);
		if (cachedPanelHtmlTemplate === undefined) {
			cachedPanelHtmlTemplate = readFileSync(htmlPath, "utf-8");
		}
		let template = cachedPanelHtmlTemplate;
		template = template
			.replace(/\{\{CSP\}\}/g, csp)
			.replace(/\{\{NONCE\}\}/g, nonce)
			.replace("{{STYLE_URI}}", styleUri.toString())
			.replace("{{SCRIPT_URI}}", scriptUri.toString());

		webviewView.webview.html = template;

		// 網頁端 vscode.postMessage({ type, ... }) → 此處對應寫入佇列／答案檔等。
		webviewView.webview.onDidReceiveMessage(async (msg) => {
			const dir = this.getDataDir();
			try {
				switch (msg?.type) {
					// 前端載入完成，拉一次完整狀態。
					case "ready":
						await pushStateToPanel();
						break;
					case "sendText": {
						const text = String(msg.text ?? "").trim();
						if (text) {
							await appendQueueWithTokenRecord(dir, {
								type: "text",
								content: text,
							});
						}
						await pushStateToPanel();
						break;
					}
					case "resetTokenStats": {
						await resetTokenStats(dir);
						await pushStateToPanel();
						break;
					}
					// MCP 問答：寫入答案檔供 mcp-server 讀取。
					case "submitAnswer": {
						const answers = (msg.answers ?? []) as AnswerEntry[];
						await writeAnswerFile(dir, answers);
						await pushStateToPanel();
						break;
					}
					// 以空答案表示略過／取消目前題目。
					case "cancelQuestion": {
						await writeAnswerFile(dir, []);
						await pushStateToPanel();
						break;
					}
					// 使用者已讀代理回覆，刪除 reply 檔。
					case "ackReply": {
						await unlinkReply(dir);
						await pushStateToPanel();
						break;
					}
					// 剪貼簿圖片：落檔至 messenger-data/paste 再當 image 進佇列。
					case "pasteImage": {
						const base64 = String(
							(msg as { base64?: string }).base64 ?? ""
						);
						const mime = String(
							(msg as { mime?: string }).mime ?? "image/png"
						);
						if (!base64) break;
						const maxB64 = 25 * 1024 * 1024;
						if (base64.length > maxB64) {
							void vscode.window.showWarningMessage(
								"貼上的圖片過大，請改存檔後用「圖片」選取。"
							);
							break;
						}
						let ext = "png";
						if (/jpe?g/i.test(mime)) ext = "jpg";
						else if (/gif/i.test(mime)) ext = "gif";
						else if (/webp/i.test(mime)) ext = "webp";
						else if (/bmp/i.test(mime)) ext = "bmp";
						const sub = path.join(dir, "paste");
						await fs.mkdir(sub, { recursive: true });
						const fp = path.join(sub, `paste-${Date.now()}.${ext}`);
						await fs.writeFile(fp, Buffer.from(base64, "base64"));
						await appendQueueWithTokenRecord(dir, {
							type: "image",
							path: fp,
						});
						await pushStateToPanel();
						break;
					}
					// 系統檔案選擇器；可複選，依 kind 當圖片或一般檔案入佇列。
					case "pickQueueFiles": {
						const kind = String(
							(msg as { kind?: string }).kind ?? "file"
						) as "image" | "file";
						const uris = await vscode.window.showOpenDialog({
							canSelectMany: true,
							openLabel: kind === "image" ? "選擇圖片" : "選擇檔案",
							filters:
								kind === "image"
									? {
											Images: [
												"png",
												"jpg",
												"jpeg",
												"gif",
												"webp",
												"svg",
												"bmp",
											],
										}
									: { "所有檔案": ["*"] },
						});
						if (uris?.length) {
							for (const u of uris) {
								if (u.scheme !== "file") continue;
								const fp = u.fsPath;
								if (kind === "image") {
									await appendQueueWithTokenRecord(dir, {
										type: "image",
										path: fp,
									});
								} else {
									await appendQueueWithTokenRecord(dir, {
										type: "file",
										path: fp,
									});
								}
							}
							await pushStateToPanel();
						}
						break;
					}
					default:
						break;
				}
			} catch {
				// 寫檔等失敗不拋回 webview，避免中斷後續訊息。
			}
		});

		webviewView.onDidDispose(() => {
			// 避免全域仍指向已銷毀的 webview，後續 postMessage 前會先判斷 panelView。
			if (panelView === webviewView) panelView = undefined;
		});
	}
}

/** 產生 CSP `script` 用的隨機 nonce。 */
function getNonce(): string {
	let t = "";
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		t += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return t;
}
