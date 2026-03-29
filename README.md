# mcp-cursor-message

**MCP side-channel chat for Cursor and VS Code.** Queue messages from a sidebar, let your agent pull them with `check_messages`, run structured `ask_question` flows, and surface progress—without juggling copy-paste in the terminal.

*Traditional Chinese:* [README.tw.md](./README.tw.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## Disclaimer

This project is provided **for academic exchange and technical research only**. The repository, extension, and MCP server are offered **as-is**, **without warranty of any kind**, whether express or implied. The authors and contributors **are not liable** for any damages arising from use or inability to use this software.

You are responsible for security and compliance. Output from this tool **does not constitute** professional advice. If you do not agree, do not download, install, or use this software.

## What you get

The project pairs a **sidebar extension** with an **MCP server**: both share a small on-disk message store so the model and the UI stay in sync. Typical uses include queued user input, multi-step Q&A with fixed options, and lightweight progress text shown next to the editor. The sidebar shows the queue, Q&A cards, and reply summaries. **Language** is configurable from the panel header or **`mcpMessenger.uiLanguage`** (search **MCP chat** in Settings) for **zh**, **auto**, or **en**. With a folder workspace, the data directory is **`<workspace>/.cursor/messenger-data`** and must match **`MESSENGER_DATA_DIR`** in your MCP config.

### For AI assistants (sidebar queue + MCP)

After each reply when the sidebar queue is in use, call the **`check_messages`** tool on the **`mcp-cursor-message`** MCP server so the extension can deliver the next message.

## Requirements

- **Cursor** or **Visual Studio Code** (see `engines.vscode` in `package.json`)
- **Bun** only if you build the `.vsix` from source

## Quick start

1. Install the latest **`.vsix`** from [**Releases**](https://github.com/911218sky/mcp-cursor-message/releases) via **Extensions → Install from VSIX…**, then reload the window.
2. Open a **folder** workspace and run the command **mcp-cursor-message: Install MCP configuration** from the Command Palette so MCP points at the same data directory as the sidebar. Restart the editor if MCP does not appear.
3. **Cursor:** Open **Cursor Settings → MCP** and **enable** the **mcp-cursor-message** server (or confirm it appears and is turned on). The sidebar works without this, but the agent **cannot** call `check_messages` until MCP is active for your workspace.

### Install from source

Clone the repository, install dependencies with **Bun**, build the extension package, then install the generated `.vsix` the same way as a release build:

```bash
git clone https://github.com/911218sky/mcp-cursor-message.git
cd mcp-cursor-message
bun install
bun run package
```

The VSIX is written to the repository root (for example `mcp-cursor-message-9.2.0.vsix`, version from `package.json`).

## Troubleshooting

- **Webview fails to load** (including Service Worker–related messages): often a known class of issues in the embedded Chromium; try closing all windows and reopening, or update Cursor. See [microsoft/vscode#125993](https://github.com/microsoft/vscode/issues/125993).
- **MCP does not appear** / tools never run: confirm you ran **mcp-cursor-message: Install MCP configuration** and restarted; in **Cursor Settings → MCP**, enable the server; check `.cursor/mcp.json` for the correct server command and `MESSENGER_DATA_DIR`.

## Contributing & internals

Contributor workflow, IPC contracts, and versioning live in [**AGENTS.md**](./AGENTS.md) and [**PROJECT.md**](./PROJECT.md).

## License

[**AGPL-3.0**](./LICENSE)
