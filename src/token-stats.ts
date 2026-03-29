/**
 * 持久化「側欄送入佇列」累計 token 約略值（`token-stats.json`）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { QueueMsg } from "./types/ipc-json";
import {
	estimateFileTokens,
	estimateImageFileTokens,
	estimateTextTokens,
} from "./token-estimate";

export type TokenStatsPayload = {
	/** 累計（約略） */
	totalEstimated: number;
	/** 上一則佇列訊息貢獻的約略 token */
	lastMessageEstimated: number;
	updatedAt: string;
};

const FILE = "token-stats.json";

function pathFor(dataDir: string): string {
	return path.join(dataDir, FILE);
}

export async function readTokenStats(
	dataDir: string
): Promise<TokenStatsPayload> {
	try {
		const raw = await fs.readFile(pathFor(dataDir), "utf-8");
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
		await fs.unlink(pathFor(dataDir));
	} catch {
		/* 無檔 */
	}
}

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
		pathFor(dataDir),
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
		pathFor(dataDir),
		JSON.stringify(next, null, 2),
		"utf-8"
	);
	return next;
}
