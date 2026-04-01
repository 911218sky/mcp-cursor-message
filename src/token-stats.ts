/**
 * 側欄佇列相關的 token：約略估算（非 tiktoken）與累計持久化（`token-stats.json`）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { QueueMsg } from "./types/ipc-json";

// --- 型別 -----------------------------------------------------------------

export type TokenStatsPayload = {
	/** 累計（約略） */
	totalEstimated: number;
	/** 上一則佇列訊息貢獻的約略 token */
	lastMessageEstimated: number;
	updatedAt: string;
};

// --- 常數 -----------------------------------------------------------------

const STATS_FILE = "token-stats.json";

/** 小檔可讀入全文做 `estimateTextTokens` 的副檔名（不含點）。 */
const TEXT_EXT = new Set([
	"txt",
	"md",
	"json",
	"jsonc",
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"css",
	"html",
	"htm",
	"xml",
	"yml",
	"yaml",
	"toml",
	"ini",
	"sh",
	"bat",
	"ps1",
	"py",
	"go",
	"rs",
	"java",
	"kt",
	"c",
	"cpp",
	"h",
	"cs",
	"sql",
]);

// --- Token 約略估算 -------------------------------------------------------

/** 純文字：中英混排粗估（CJK 約 1 token／字，ASCII 約 4 字 1 token）。 */
export function estimateTextTokens(text: string): number {
	const s = String(text ?? "");
	if (!s.trim()) return 0;
	let units = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		// 常見中日韓與全形等
		if (c >= 0x1100 || (c >= 0x2e80 && c <= 0x9fff)) units += 1;
		else units += 0.28;
	}
	return Math.max(1, Math.ceil(units));
}

/** 圖檔：依位元組數粗估（視覺模型通常與解析度／patch 有關，此處為顯示用區間）。 */
export function estimateImageFileTokens(byteSize: number): number {
	const n = Number(byteSize) || 0;
	if (n <= 0) return 64;
	return Math.min(8000, Math.max(96, Math.ceil(n / 2048) * 64));
}

/** 一般檔案：小文字檔可讀入估算；其餘用位元組／4。 */
export async function estimateFileTokens(
	filePath: string,
	byteSize: number
): Promise<number> {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const cap = 512 * 1024;
	if (TEXT_EXT.has(ext) && byteSize > 0 && byteSize <= cap) {
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			return estimateTextTokens(raw);
		} catch {
			/* fallthrough */
		}
	}
	const n = Number(byteSize) || 0;
	return Math.max(1, Math.min(200_000, Math.ceil(n / 4)));
}

// --- 持久化（token-stats.json）---------------------------------------------

function statsPath(dataDir: string): string {
	return path.join(dataDir, STATS_FILE);
}

export async function readTokenStats(
	dataDir: string
): Promise<TokenStatsPayload> {
	try {
		const raw = await fs.readFile(statsPath(dataDir), "utf-8");
		const o = JSON.parse(raw) as Partial<TokenStatsPayload>;
		return {
			totalEstimated: Math.max(0, Number(o.totalEstimated) || 0),
			lastMessageEstimated: Math.max(0, Number(o.lastMessageEstimated) || 0),
			updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
		};
	} catch {
		return {
			totalEstimated: 0,
			lastMessageEstimated: 0,
			updatedAt: "",
		};
	}
}

export async function resetTokenStats(dataDir: string): Promise<void> {
	try {
		await fs.unlink(statsPath(dataDir));
	} catch {
		/* 無檔 */
	}
}

// --- 佇列訊息累計 ---------------------------------------------------------

/** 與 `recordTokensForQueueMessage` 相同之單則約略 token 增量。 */
async function estimateDeltaForMessage(msg: QueueMsg): Promise<number> {
	if (msg.type === "text") {
		return estimateTextTokens(String(msg.content ?? ""));
	}
	if (msg.type === "image") {
		let d = 0;
		if (msg.caption) d += estimateTextTokens(msg.caption);
		const fp = String(msg.path ?? "");
		if (!fp) return d;
		try {
			const st = await fs.stat(fp);
			d += estimateImageFileTokens(st.size);
			return d;
		} catch {
			return d + 256;
		}
	}
	if (msg.type === "file") {
		const fp = String(msg.path ?? "");
		if (!fp) return 0;
		try {
			const st = await fs.stat(fp);
			return await estimateFileTokens(fp, st.size);
		} catch {
			return 32;
		}
	}
	return 0;
}

/** 依佇列訊息估算 token，累加寫入 `token-stats.json`。 */
export async function recordTokensForQueueMessage(
	dataDir: string,
	msg: QueueMsg
): Promise<TokenStatsPayload> {
	const delta = await estimateDeltaForMessage(msg);

	const prev = await readTokenStats(dataDir);
	const next: TokenStatsPayload = {
		totalEstimated: prev.totalEstimated + delta,
		lastMessageEstimated: delta,
		updatedAt: new Date().toISOString(),
	};
	await fs.mkdir(dataDir, { recursive: true });
	await fs.writeFile(
		statsPath(dataDir),
		JSON.stringify(next, null, 2),
		"utf-8"
	);
	return next;
}

/** 自累計約略 token 扣除一則佇列訊息（撤銷送出時呼叫）。 */
export async function subtractTokensForQueueMessage(
	dataDir: string,
	msg: QueueMsg
): Promise<TokenStatsPayload> {
	const delta = await estimateDeltaForMessage(msg);
	const prev = await readTokenStats(dataDir);
	const next: TokenStatsPayload = {
		totalEstimated: Math.max(0, prev.totalEstimated - delta),
		lastMessageEstimated: 0,
		updatedAt: new Date().toISOString(),
	};
	await fs.mkdir(dataDir, { recursive: true });
	await fs.writeFile(
		statsPath(dataDir),
		JSON.stringify(next, null, 2),
		"utf-8"
	);
	return next;
}
