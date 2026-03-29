# mcp-cursor-message

MCP side-channel chat: a sidebar queue and MCP tools (`check_messages`, `ask_question`, etc.) bridge Cursor so agents can push summaries, structured prompts, and read user replies.

*Traditional Chinese:* [README.tw.md](./README.tw.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## Disclaimer

This project is provided **for academic exchange and technical research only**. The repository, extension, and MCP server are offered **as-is**, **without warranty of any kind**, whether express or implied (including but not limited to merchantability, fitness for a particular purpose, or non-infringement). The authors and contributors **are not liable** for any direct, indirect, incidental, or consequential damages arising from use or inability to use this software.

You are responsible for security and compliance (data handling, API keys, third-party services, and applicable laws). Content produced or sent through this tool **does not constitute** legal, medical, financial, or any other professional advice. If you do not agree, do not download, install, or use this software.

## Overview

| Component | Role |
|-----------|------|
| **VS Code / Cursor extension** | Activity Bar sidebar “MCP 對話”, file-based IPC under `messenger-data`, commands to install/remove MCP config |
| **MCP server** | Shares the same data directory with the extension; exposes `check_messages`, `ask_question`, `send_progress`, and related tools |

Useful when you want **in-editor** flows for queued messages, multi-choice Q&A, and progress updates instead of relying only on the terminal.

## Requirements

- **Cursor** or **Visual Studio Code** (engine **^1.105.0**; see `package.json`)
- **[Bun](https://bun.sh)** on your machine to build a `.vsix` (matches the `packageManager` field)

## Installation

### From GitHub Releases (recommended)

1. Download the latest `.vsix` from [**Releases**](https://github.com/911218sky/mcp-cursor-message/releases).
2. In Cursor / VS Code: Extensions → `⋯` → **Install from VSIX…** → pick the file.
3. **Reload the window** when prompted.

### Build from source

```bash
git clone https://github.com/911218sky/mcp-cursor-message.git
cd mcp-cursor-message
bun install
bun run package
```

A `.vsix` appears in the repo root; install it as above.

### MCP config (workspace)

1. Open a **folder** as your workspace.
2. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → run **`mcp-cursor-message: 安裝 MCP 設定`** (command title may stay Chinese depending on locale).
3. This writes `.cursor/mcp.json` and `MESSENGER_DATA_DIR` for the workspace. **Restart Cursor** if MCP does not show up.

## Usage summary

- **Sidebar**: queue, Q&A card, reply/progress summaries; updated via extension commands and MCP tools.
- **Commands** (see `package.json` → `contributes.commands`): install/remove MCP config, enqueue files, reset approximate token stats, etc.
- **Data directory**: with a workspace it is `<workspace>/.cursor/messenger-data`; without a folder it lives under the extension’s global storage path. It must stay aligned with `MESSENGER_DATA_DIR` in MCP config.

## Development

| Command | Purpose |
|---------|---------|
| `bun run compile` | Build MCP bundle + extension + webview |
| `bun run compile:mcp` | Build `dist/mcp-server.mjs` only |
| `bun run compile:ext` | Build `dist/extension.js` and `dist/webview.js` only |
| `bun run package` | Build and run `vsce` to emit `.vsix` |

Build definitions live in [`esbuild.config.mjs`](./esbuild.config.mjs).

### CI

[`.github/workflows/package.yml`](./.github/workflows/package.yml) compiles and uploads artifacts on push to the default branch; publishing a **GitHub Release** attaches the `.vsix`.

## Troubleshooting

- **Webview fails to load** (including Service Worker errors): often upstream editor/Chromium behavior—try closing all windows and reopening, or update Cursor. See [microsoft/vscode#125993](https://github.com/microsoft/vscode/issues/125993).
- **MCP missing**: run the install-MCP command and restart; verify `.cursor/mcp.json` points to the correct server command and `MESSENGER_DATA_DIR`.

## License

Distributed under [**AGPL-3.0-only**](./LICENSE).

## Links

- **Repository**: [github.com/911218sky/mcp-cursor-message](https://github.com/911218sky/mcp-cursor-message)
- **Traditional Chinese**: [README.tw.md](./README.tw.md)
- **Maintainers**: [Runtime flow (PROJECT.md)](./PROJECT.md) · [Agent guidelines (AGENTS.md)](./AGENTS.md)
