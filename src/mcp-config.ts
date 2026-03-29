/**
 * 寫入／移除工作區 `.cursor/mcp.json` 中的 MCP 條目。
 * Cursor 依此啟動 `dist/mcp-server.mjs` 並注入 `MESSENGER_DATA_DIR`。
 */
import fs from "node:fs/promises";
import path from "node:path";

/** 與 MCP 伺服器 `MCP_DISPLAY_NAME`、`.cursor/mcp.json` 鍵名一致。 */
export const SERVER_KEY = "mcp-cursor-message";

/** 舊版鍵名：安裝時移除以避免重複伺服器；卸載時一併清除。 */
const LEGACY_MCP_SERVER_KEYS = ["Cursor MCP 對話外掛（源碼版）"] as const;

type McpJsonShape = {
	mcpServers?: Record<
		string,
		{ command?: string; args?: string[]; env?: Record<string, string> }
	>;
};

/**
 * 合併或建立 `.cursor/mcp.json`，註冊本專案 MCP 與 `MESSENGER_DATA_DIR`，
 * 並移除舊版鍵名以免重複伺服器。
 */
export async function installMcpServer(
	workspaceRoot: string,
	extensionPath: string,
	messengerDataDir: string
): Promise<void> {
	const cursorDir = path.join(workspaceRoot, ".cursor");
	await fs.mkdir(cursorDir, { recursive: true });
	const mcpPath = path.join(cursorDir, "mcp.json");
	const mcpServerPath = path.join(extensionPath, "dist", "mcp-server.mjs");

	let doc: McpJsonShape = {};
	try {
		const raw = await fs.readFile(mcpPath, "utf-8");
		doc = JSON.parse(raw) as McpJsonShape;
	} catch {
		doc = {};
	}
	if (!doc.mcpServers) doc.mcpServers = {};

	for (const k of LEGACY_MCP_SERVER_KEYS) {
		delete doc.mcpServers[k];
	}

	doc.mcpServers[SERVER_KEY] = {
		command: "node",
		args: [mcpServerPath],
		env: {
			MESSENGER_DATA_DIR: messengerDataDir,
		},
	};

	await fs.writeFile(mcpPath, JSON.stringify(doc, null, 2), "utf-8");
}

/** 自 `mcp.json` 移除 `SERVER_KEY` 與舊版鍵名；檔案仍存在以保留其他伺服器設定。 */
export async function removeMcpServer(workspaceRoot: string): Promise<void> {
	const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
	let doc: McpJsonShape;
	try {
		const raw = await fs.readFile(mcpPath, "utf-8");
		doc = JSON.parse(raw) as McpJsonShape;
	} catch {
		return;
	}
	if (doc.mcpServers) {
		delete doc.mcpServers[SERVER_KEY];
		for (const k of LEGACY_MCP_SERVER_KEYS) {
			delete doc.mcpServers[k];
		}
	}
	await fs.writeFile(mcpPath, JSON.stringify(doc, null, 2), "utf-8");
}
