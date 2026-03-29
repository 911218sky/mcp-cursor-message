// @ts-check
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
