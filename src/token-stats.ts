/**
 * 持久化「側欄送入佇列」累計 token 約略值（`token-stats.json`）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { QueueMsg } from "./ipc-types";
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

/** 依佇列訊息估算 token，累加寫入 `token-stats.json`。 */
export async function recordTokensForQueueMessage(
	dataDir: string,
	msg: QueueMsg
): Promise<TokenStatsPayload> {
	let delta = 0;
	if (msg.type === "text") {
		delta = estimateTextTokens(String(msg.content ?? ""));
	} else if (msg.type === "image") {
		const fp = String(msg.path ?? "");
		if (fp) {
			try {
				const st = await fs.stat(fp);
				delta = estimateImageFileTokens(st.size);
			} catch {
				delta = 256;
			}
		}
	} else if (msg.type === "file") {
		const fp = String(msg.path ?? "");
		if (fp) {
			try {
				const st = await fs.stat(fp);
				delta = await estimateFileTokens(fp, st.size);
			} catch {
				delta = 32;
			}
		}
	}

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
