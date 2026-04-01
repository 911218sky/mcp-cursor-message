/**
 * 將 `everything-claude-code/.cursor` 合併進工作區根目錄的 `.cursor`。
 * 由 `extension.ts` 呼叫；若 **`mcpMessenger.mergeEverythingClaudeCode.enabled`** 為 `false` 則略過（預設為開啟）。
 * Submodule 見 `.gitmodules`；clone 本 repo 後請執行 `git submodule update --init --recursive`。
 */
import fs from "node:fs/promises";
import path from "node:path";

/** 內建合併快取：避免每次啟用都掃描 VSIX 內大量檔案。刪除此檔可強制重新套用內建種子。 */
const BUNDLED_SEED_MARKER = ".mcp-messenger-ecc-bundled";

type BundledSeedMarkerPayload = { bundledExtensionVersion?: string };

async function readBundledSeedMarker(destDir: string): Promise<string | null> {
	try {
		const raw = await fs.readFile(
			path.join(destDir, BUNDLED_SEED_MARKER),
			"utf-8"
		);
		const o = JSON.parse(raw) as BundledSeedMarkerPayload;
		const v = o.bundledExtensionVersion;
		return typeof v === "string" && v.trim() ? v.trim() : null;
	} catch {
		return null;
	}
}

async function writeBundledSeedMarker(
	destDir: string,
	extensionVersion: string
): Promise<void> {
	await fs.mkdir(destDir, { recursive: true });
	const body = JSON.stringify(
		{ bundledExtensionVersion: extensionVersion },
		null,
		2
	);
	await fs.writeFile(path.join(destDir, BUNDLED_SEED_MARKER), body, "utf-8");
}

/** `fs.access` 封裝：存在回 `true`，否則 `false`（不區分檔案／目錄）。 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * 將 `srcDir` 下檔案樹併入 `destDir`；目錄會遞迴建立。
 * 一般檔：僅在 `dest` 尚不存在該檔路徑時 `copyFile`（見函式開頭模組說明）。
 */
async function mergeTree(srcDir: string, destDir: string): Promise<void> {
	const entries = await fs.readdir(srcDir, { withFileTypes: true });
	await fs.mkdir(destDir, { recursive: true });
	for (const ent of entries) {
		const from = path.join(srcDir, ent.name);
		const to = path.join(destDir, ent.name);
		if (ent.isDirectory()) {
			await mergeTree(from, to);
			continue;
		}
		if (!ent.isFile()) continue;
		if (await pathExists(to)) continue;
		await fs.copyFile(from, to);
	}
}

/**
 * 啟用擴充或切換工作區時呼叫；`extensionRoot` 傳 `context.extensionPath`；`bundledSeedExtensionVersion` 傳 `package.json` 的 `version`。
 */
export async function mergeEverythingClaudeCodeCursor(
	workspaceRoot: string,
	extensionRoot?: string,
	bundledSeedExtensionVersion?: string
): Promise<void> {
	const dest = path.join(workspaceRoot, ".cursor");
	const wsSrc = path.join(workspaceRoot, "everything-claude-code", ".cursor");
	if (await pathExists(wsSrc)) {
		await mergeTree(wsSrc, dest);
	}
	if (!extensionRoot) return;

	const bundledSrc = path.join(extensionRoot, "everything-claude-code", ".cursor");
	if (!(await pathExists(bundledSrc))) return;

	const ver = bundledSeedExtensionVersion?.trim();
	if (ver) {
		const prev = await readBundledSeedMarker(dest);
		if (prev === ver) return;
	}

	await mergeTree(bundledSrc, dest);

	if (ver) {
		await writeBundledSeedMarker(dest, ver);
	}
}
