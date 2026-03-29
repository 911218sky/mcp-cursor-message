# mcp-cursor-message

**MCP side-channel chat for Cursor and VS Code.** Queue messages from a sidebar, let your agent pull them with `check_messages`, run structured `ask_question` flows, and surface progress—without juggling copy-paste in the terminal.

*Traditional Chinese:* [README.tw.md](./README.tw.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## Disclaimer

This project is provided **for academic exchange and technical research only**. The repository, extension, and MCP server are offered **as-is**, **without warranty of any kind**, whether express or implied. The authors and contributors **are not liable** for any damages arising from use or inability to use this software.

You are responsible for security and compliance. Output from this tool **does not constitute** professional advice. If you do not agree, do not download, install, or use this software.

## What you get

The project pairs a **sidebar extension** with an **MCP server**: both share a small on-disk message store so the model and the UI stay in sync. Typical uses include queued user input, multi-step Q&A with fixed options, and lightweight progress text shown next to the editor.

## Requirements

- **Cursor** or **Visual Studio Code** (see `engines.vscode` in `package.json`)
- **Bun** only if you build the `.vsix` from source

## Quick start

1. Install the latest **`.vsix`** from [**Releases**](https://github.com/911218sky/mcp-cursor-message/releases) via **Extensions → Install from VSIX…**, then reload the window.
2. Open a **folder** workspace and run the command **mcp-cursor-message: 安裝 MCP 設定** from the Command Palette so MCP points at the same data directory as the sidebar. Restart the editor if MCP does not appear.
3. **Sidebar language** defaults to **English**; change **`mcpMessenger.uiLanguage`** in Settings for **zh**, **auto**, or **en**.

### Install from source

Clone the repository, install dependencies with **Bun**, build the extension package, then install the generated `.vsix` the same way as a release build:

```bash
git clone https://github.com/911218sky/mcp-cursor-message.git
cd mcp-cursor-message
bun install
bun run package
```

The VSIX is written to the repository root (for example `mcp-cursor-message-9.0.0.vsix`, version from `package.json`).

## Contributing & internals

Contributor workflow, IPC contracts, and versioning live in [**AGENTS.md**](./AGENTS.md) and [**PROJECT.md**](./PROJECT.md).

## License

[**AGPL-3.0**](./LICENSE)
