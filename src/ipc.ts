/**
 * 與 MCP 共用目錄的檔案 IPC（檔名與 mcp-server 約定一致）。
 * 擴充與 MCP 進程不直接通訊，僅透過此模組讀寫 JSON 檔。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { PanelHistoryEntry } from "./types/panel-messages";
import type { AnswerEntry, QueueMsg } from "./types/ipc-json";

/** 佇列持久化時附加 `timestamp`（供 UI 預覽）。 */
export type QueueMsgStored = QueueMsg & { timestamp?: string };

/** 回傳資料目錄下各 IPC 檔案的絕對路徑。 */
export function getIpcPaths(dataDir: string) {
	return {
		dataDir,
		queueFile: path.join(dataDir, "queue.json"),
		questionFile: path.join(dataDir, "question.json"),
		answerFile: path.join(dataDir, "answer.json"),
		replyFile: path.join(dataDir, "reply.json"),
		historyFile: path.join(dataDir, "history.json"),
	};
}

/** 確保 IPC 目錄存在（首次寫入前呼叫）。 */
export async function ensureDataDir(dataDir: string): Promise<void> {
	await fs.mkdir(dataDir, { recursive: true });
}

/** 讀取 `queue.json`；檔案不存在或解析失敗時回傳空陣列。 */
export async function readQueue(dataDir: string): Promise<QueueMsgStored[]> {
	const { queueFile } = getIpcPaths(dataDir);
	try {
		const raw = await fs.readFile(queueFile, "utf-8");
		const data = JSON.parse(raw) as unknown;
		return Array.isArray(data) ? (data as QueueMsgStored[]) : [];
	} catch {
		return [];
	}
}

/** 覆寫整份 `queue.json`（側欄預覽與 MCP 讀取共用）。 */
export async function writeQueue(
	dataDir: string,
	queue: QueueMsgStored[]
): Promise<void> {
	const { queueFile } = getIpcPaths(dataDir);
	await ensureDataDir(dataDir);
	await fs.writeFile(queueFile, JSON.stringify(queue, null, 2), "utf-8");
}

/** 讀取現有佇列後附加一則訊息並寫回（側欄「送出」、右鍵送檔皆走此路）。 */
export async function appendQueue(
	dataDir: string,
	msg: QueueMsg
): Promise<void> {
	const q = await readQueue(dataDir);
	const stored: QueueMsgStored = {
		...msg,
		timestamp: new Date().toISOString(),
	};
	q.push(stored);
	await writeQueue(dataDir, q);
}

/** 若為側欄貼上寫入之 `paste/` 圖檔，自磁碟刪除（不刪檔案選擇器加入之路徑）。 */
export async function unlinkPasteImageIfManaged(
	dataDir: string,
	msg: QueueMsg
): Promise<void> {
	if (msg.type !== "image" || !msg.path) return;
	const pasteRoot = path.normalize(path.join(dataDir, "paste"));
	const fp = path.normalize(msg.path);
	if (!fp.startsWith(pasteRoot + path.sep)) return;
	try {
		await fs.unlink(fp);
	} catch {
		/* 已刪或無檔 */
	}
}

/**
 * 依索引自 `queue.json` 移除一則訊息（側欄「撤銷」）；索引以目前檔案順序為準。
 * 回傳被移除項目供 token 統計回沖；無效索引回 `null`。
 */
export async function removeQueueItemAtIndex(
	dataDir: string,
	index: number
): Promise<QueueMsgStored | null> {
	const q = await readQueue(dataDir);
	if (index < 0 || index >= q.length) return null;
	const removed = q.splice(index, 1)[0];
	await writeQueue(dataDir, q);
	return removed ?? null;
}

/** 讀取 MCP 寫入的 `question.json`（`ask_question` 待答題目）；無檔時回 `null`。 */
export async function readQuestion(dataDir: string): Promise<unknown | null> {
	const { questionFile } = getIpcPaths(dataDir);
	try {
		const raw = await fs.readFile(questionFile, "utf-8");
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

/** 讀取 `reply.json`（`check_messages` 的 `reply` 或 `send_progress` 的摘要）。 */
export async function readReply(
	dataDir: string
): Promise<
	{ content: string; kind?: "progress" | "final"; timestamp?: string } | null
> {
	const { replyFile } = getIpcPaths(dataDir);
	try {
		const raw = await fs.readFile(replyFile, "utf-8");
		const o = JSON.parse(raw) as {
			content?: string;
			kind?: unknown;
			timestamp?: string;
		};
		if (typeof o.content === "string") {
			const kind = o.kind === "progress" || o.kind === "final" ? o.kind : undefined;
			return { content: o.content, kind, timestamp: o.timestamp };
		}
		return null;
	} catch {
		return null;
	}
}

/** 將使用者作答寫入 `answer.json`，供 MCP 端 `ask_question` 輪詢讀取。 */
export async function writeAnswerFile(
	dataDir: string,
	answers: AnswerEntry[]
): Promise<void> {
	const { answerFile } = getIpcPaths(dataDir);
	await ensureDataDir(dataDir);
	await fs.writeFile(
		answerFile,
		JSON.stringify({ answers }, null, 2),
		"utf-8"
	);
}

/** 使用者按下「已閱」後刪除 `reply.json`，清除摘要顯示。 */
export async function unlinkReply(dataDir: string): Promise<void> {
	const { replyFile } = getIpcPaths(dataDir);
	try {
		await fs.unlink(replyFile);
	} catch {
		/* 無檔 */
	}
}

/** 必要時刪除 `question.json`（目前主要由 MCP 端在收到答案後清理）。 */
export async function unlinkQuestion(dataDir: string): Promise<void> {
	const { questionFile } = getIpcPaths(dataDir);
	try {
		await fs.unlink(questionFile);
	} catch {
		/* 無檔 */
	}
}

/** 驗證並正規化側欄歷史 JSON（陣列）。 */
export function normalizePanelHistory(raw: unknown): PanelHistoryEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: PanelHistoryEntry[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const row = item as Partial<PanelHistoryEntry>;
		if (row.role !== "user" && row.role !== "assistant") continue;
		if (typeof row.content !== "string" || !row.content.trim()) continue;
		const ts = typeof row.ts === "number" ? row.ts : Date.now();
		out.push({ role: row.role, content: row.content.trim(), ts });
	}
	return out;
}

/** 讀取 `history.json`；不存在或格式錯誤時回傳空陣列。 */
export async function readPanelHistory(
	dataDir: string
): Promise<PanelHistoryEntry[]> {
	const { historyFile } = getIpcPaths(dataDir);
	try {
		const raw = await fs.readFile(historyFile, "utf-8");
		return normalizePanelHistory(JSON.parse(raw) as unknown);
	} catch {
		return [];
	}
}

/** 覆寫 `history.json`（側欄對話歷史）。 */
export async function writePanelHistory(
	dataDir: string,
	entries: PanelHistoryEntry[]
): Promise<void> {
	const { historyFile } = getIpcPaths(dataDir);
	await ensureDataDir(dataDir);
	await fs.writeFile(historyFile, JSON.stringify(entries, null, 2), "utf-8");
}
