// @ts-check
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as esbuild from "esbuild";

const minifyShared = {
	minify: true,
	legalComments: /** @type {"none"} */ ("none"),
	define: { "process.env.NODE_ENV": '"production"' },
};

/** @type {esbuild.BuildOptions} */
const mcp = {
	entryPoints: ["mcp-server/index.ts"],
	bundle: true,
	...minifyShared,
	outfile: "dist/mcp-server.mjs",
	format: "esm",
	platform: "node",
};

/** @type {esbuild.BuildOptions} */
const extension = {
	entryPoints: ["src/extension.ts"],
	bundle: true,
	...minifyShared,
	platform: "node",
	target: "es2022",
	outfile: "dist/extension.js",
	external: ["vscode"],
	format: "cjs",
};

/** @type {esbuild.BuildOptions} */
const webview = {
	entryPoints: ["src/webview/main.ts"],
	bundle: true,
	...minifyShared,
	platform: "browser",
	target: "es2020",
	outfile: "dist/webview.js",
	format: "iife",
};

const jobs = { mcp, ext: [extension, webview], all: [mcp, extension, webview] };

const arg = process.argv[2] ?? "all";
const batch = jobs[arg];
if (!batch) {
	console.error(`Usage: node esbuild.config.mjs [mcp|ext|all]`);
	process.exit(1);
}

const builds = Array.isArray(batch) ? batch : [batch];
await Promise.all(builds.map((opts) => esbuild.build(opts)));

/** 將 `src/rules/*.mdc` 同步到 `.cursor/rules/`，供 VSIX 打包與執行時讀取（與 extension 的來源順序一致）。 */
async function copySrcRulesToCursorRules() {
	const srcDir = path.join(process.cwd(), "src", "rules");
	const destDir = path.join(process.cwd(), ".cursor", "rules");
	let entries;
	try {
		entries = await fs.readdir(srcDir);
	} catch {
		return;
	}
	await fs.mkdir(destDir, { recursive: true });
	for (const f of entries) {
		if (!f.endsWith(".mdc")) continue;
		await fs.copyFile(path.join(srcDir, f), path.join(destDir, f));
	}
}
await copySrcRulesToCursorRules();
