# mcp-cursor-message

**MCP side-channel chat for Cursor and VS Code.** Queue messages from a sidebar, let your agent pull them with `check_messages`, run structured `ask_question` flows, and surface progress—without juggling copy-paste in the terminal.

*Traditional Chinese:* [README.tw.md](./README.tw.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## Disclaimer

This project is provided **for academic exchange and technical research only**. The repository, extension, and MCP server are offered **as-is**, **without warranty of any kind**, whether express or implied. The authors and contributors **are not liable** for any damages arising from use or inability to use this software.

You are responsible for security and compliance. Output from this tool **does not constitute** professional advice. If you do not agree, do not download, install, or use this software.

## What you get

The project pairs a **sidebar extension** with an **MCP server**: both share a small on-disk message store so the model and the UI stay in sync. Typical uses include queued user input, multi-step Q&A with fixed options, and lightweight progress text shown next to the editor. The sidebar shows the queue, Q&A cards, and reply summaries. **Language** is configurable from the panel header or **`mcpMessenger.uiLanguage`** (search **MCP chat** in Settings) for **zh**, **auto**, or **en**. With a folder workspace, the data directory is **`<workspace>/.cursor/messenger-data`** and must match **`MESSENGER_DATA_DIR`** in your MCP config. If the workspace directory is empty, the extension will automatically migrate any existing **globalStorage** `messenger-data` into the workspace directory on first open.

### For AI assistants (sidebar queue + MCP)

Hello, please strictly follow the conversation rules and use MCP to talk with me (`mcp-cursor-message`) every time. From now on, for all MCP-related questions, use MCP to interact with the user on every turn, and always invoke MCP after you send your reply.

#### Suggested tool usage rules

When using this MCP from an AI assistant or agent, we recommend the following default behavior:

- **Use `send_progress` for multi-step work**:  
  Whenever a task naturally breaks into two or more steps (for example: analyze → plan → implement → test), call `send_progress` after each key step with a short Markdown summary that includes:
  - what you just finished,
  - the current state and remaining work,
  - what you plan to do next.
- **Use `ask_question` instead of guessing**:  
  When requirements are ambiguous or there are multiple reasonable strategies, prefer calling `ask_question` to present 2–4 concrete options (single or multi-select) and let the user choose, rather than silently picking one.

These rules complement the `SYSTEM_SUFFIX` instructions returned by `check_messages` in `mcp-server/index.ts`. If you override behavior in workspace rules, keep them consistent with these defaults.

## Requirements

- **Cursor** or **Visual Studio Code** (see `engines.vscode` in `package.json`)
- **Bun** only if you build the `.vsix` from source

## Quick start

1. Install the latest **`.vsix`** from [**Releases**](https://github.com/911218sky/mcp-cursor-message/releases) via **Extensions → Install from VSIX…**, then reload the window.
2. Open a **folder** workspace and run the command **mcp-cursor-message: Install MCP configuration** from the Command Palette so MCP points at the same data directory as the sidebar. Restart the editor if MCP does not appear.
3. **Cursor:** Open **Cursor Settings → MCP** and **enable** the **mcp-cursor-message** server (or confirm it appears and is turned on). The sidebar works without this, but the agent **cannot** call `check_messages` until MCP is active for your workspace.

## Commands (extension)

Open the **Command Palette** (*View → Command Palette*, or `Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS). Type `mcp-cursor-message` or part of the command title, then press Enter.

| Command ID | Title | What it does |
|------------|-------|----------------|
| `mcpMessenger.setupMcp` | **mcp-cursor-message: Install MCP configuration** | Writes/merges `.cursor/mcp.json` in the workspace, registers the MCP server, and sets `MESSENGER_DATA_DIR` to match the sidebar data folder. Requires a **folder** workspace. |
| `mcpMessenger.removeMcp` | **mcp-cursor-message: Remove MCP configuration** | Removes this extension’s MCP entry from `.cursor/mcp.json` (does not delete the whole file). |
| `mcpMessenger.checkForUpdates` | **mcp-cursor-message: Check for updates (GitHub)** | Manually checks GitHub Releases for a newer VSIX (honors `mcpMessenger.updateCheck.*` settings). |

*Traditional Chinese version of this section:* [README.tw.md](./README.tw.md)

## MCP server tools

These are **not** Command Palette entries. The **AI agent** invokes them when **Cursor** (or another MCP client) has the **mcp-cursor-message** server enabled.

Enable the server under **Cursor Settings → MCP**. The model calls tools by name from the agent tool list; parameters are defined in `mcp-server/index.ts` (`registerTool`).

| Tool | Summary |
|------|---------|
| `check_messages` | Optional `reply` (Markdown) pushed to the sidebar. **Blocks** until the sidebar queue delivers a message or the wait times out. In typical flows this should be the **last** MCP call before ending a turn. |
| `send_progress` | Required `progress` (Markdown). **Non-blocking**; updates the sidebar progress line. |
| `ask_question` | Required `questions`. **Blocks** until the user answers in the sidebar (single/multi choice and optional free text). |

*Traditional Chinese version:* [README.tw.md](./README.tw.md)

## Settings

All keys live under the **`mcpMessenger`** prefix. In the editor: **Settings** → search **MCP chat**, or edit **User/Workspace `settings.json`** manually.

| Setting | Type | Default | What it does |
|---------|------|---------|----------------|
| `mcpMessenger.uiLanguage` | `en` \| `zh` \| `auto` | `en` | Sidebar Webview language. **`auto`** follows the editor UI language (non-English → Chinese UI). |
| `mcpMessenger.mergeEverythingClaudeCode.enabled` | boolean | `true` | When **`true`** (default), merges bundled or workspace **`everything-claude-code/.cursor`** seeds into **`<workspace>/.cursor`** (missing files only) on startup, folder change, or when you toggle this on. Set **`false`** to disable merging. |
| `mcpMessenger.updateCheck.enabled` | boolean | `true` | When **`false`**, no update checks run (background or Command Palette), and no GitHub requests. |
| `mcpMessenger.updateCheck.intervalHours` | number (≥ 1) | `12` | Hours between automatic update checks. |
| `mcpMessenger.updateCheck.startupDelaySeconds` | number (≥ 0) | `15` | Seconds to wait after startup before the **first** check; **`0`** runs immediately. |
| `mcpMessenger.updateCheck.repo` | string | `911218sky/mcp-cursor-message` | GitHub repo in **`owner/name`** form used for release checks. |
| `mcpMessenger.updateCheck.versionCompare` | `patch` \| `minor` \| `major` \| `off` | `minor` | **“Is newer”** always uses full **MAJOR.MINOR.PATCH** vs `releases/latest`. **`patch`** = background notify on any newer tag; **`minor`** (default) = only **minor** or **major** bumps (skip **patch-only**); **`major`** = **major** bumps only; **`off`** = no checks. **Manual** “Check for updates” **ignores** patch/minor/major filters (still blocked when `off` or `enabled: false`). Legacy values **`full`** and **`majorMinor`** map to **`patch`** and **`minor`**. |

```json
{
  "mcpMessenger.uiLanguage": "auto",
  "mcpMessenger.updateCheck.enabled": true,
  "mcpMessenger.updateCheck.versionCompare": "minor",
  "mcpMessenger.updateCheck.repo": "911218sky/mcp-cursor-message"
}
```

*Traditional Chinese settings guide:* [README.tw.md](./README.tw.md)

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
