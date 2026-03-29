/**
 * 側欄送入佇列內容的 token 約略估算（與 OpenAI tiktoken 不完全一致，僅供參考）。
 * 不引入大型詞表，避免擴充體積暴長。
 */

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

/** 一般檔案：小文字檔可讀入估算；其餘用位元組／4。 */
export async function estimateFileTokens(
	filePath: string,
	byteSize: number
): Promise<number> {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const cap = 512 * 1024;
	if (TEXT_EXT.has(ext) && byteSize > 0 && byteSize <= cap) {
		try {
			const fs = await import("node:fs/promises");
			const raw = await fs.readFile(filePath, "utf-8");
			return estimateTextTokens(raw);
		} catch {
			/* fallthrough */
		}
	}
	const n = Number(byteSize) || 0;
	return Math.max(1, Math.min(200_000, Math.ceil(n / 4)));
}
