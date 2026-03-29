# mcp-cursor-message（繁體中文）

MCP 旁路對話：在側欄以佇列與 MCP 工具（`check_messages`、`ask_question` 等）銜接 Cursor，讓代理能推送摘要、題目並讀取使用者回覆。

*English:* [README.md](./README.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## 免責聲明

本專案**僅供學術交流與技術研究**使用。儲存庫、擴充與 MCP 伺服器均以**現狀**提供，**不提供任何明示或默示之擔保**（包含但不限於適銷性、特定目的適用性、未侵權）。作者與貢獻者**不對**因使用或無法使用本專案所致之任何直接、間接、附帶或後果性損害負責。

使用本專案時，請自行審慎評估安全性與合規性（含資料處理、API 金鑰、第三方服務與所在地法規）；透過本工具產生或傳送之內容**不構成**法律、醫療、投資或任何專業建議。若你不同意上述條款，請勿下載、安裝或使用。

## 概覽

本專案包含兩部分：

| 元件 | 說明 |
|------|------|
| **VS Code／Cursor 擴充** | Activity Bar「MCP 對話」側欄、`messenger-data` 檔案 IPC、安裝／移除 MCP 設定命令 |
| **MCP 伺服器** | 與擴充共用資料目錄；暴露 `check_messages`、`ask_question`、`send_progress` 等工具 |

適合希望**在編輯器內**完成「排程訊息／多選問答／進度推送」的流程，而不依賴純終端輸出。

## 系統需求

- **Cursor** 或 **Visual Studio Code**（引擎版本 **^1.105.0**，見 `package.json`）
- 建立 `.vsix` 時需本機安裝 **[Bun](https://bun.sh)**（與 `packageManager` 欄位一致）

## 安裝

### 從 Release 安裝（建議）

1. 至 [**Releases**](https://github.com/911218sky/mcp-cursor-message/releases) 下載最新 `.vsix`。
2. 在 Cursor／VS Code：開啟擴充功能 → `⋯` → **從 VSIX 安裝…** → 選取該檔案。
3. 依提示**重新載入視窗**。

### 從原始碼建置

```bash
git clone https://github.com/911218sky/mcp-cursor-message.git
cd mcp-cursor-message
bun install
bun run package
```

完成後在儲存庫根目錄會產生 `.vsix`，再依上一節「從 VSIX 安裝」操作即可。

### 安裝 MCP 設定（工作區）

1. 以**資料夾**開啟工作區。
2. 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）執行 **`mcp-cursor-message: 安裝 MCP 設定`**。
3. 會寫入工作區 `.cursor/mcp.json` 與 `MESSENGER_DATA_DIR`；若 MCP 清單未更新，請**重啟 Cursor**。

## 使用摘要

- **側欄語言**：介面支援**繁中／英文**，**預設為英文**。設定搜尋 **MCP 對話** → **`mcpMessenger.uiLanguage`** 可改為 **zh**、**auto**（跟隨編輯器顯示語言）或維持 **en**。**單一 VSIX** 即含雙語。
- **側欄**：檢視佇列、問答卡、回覆摘要；可依擴充命令與 MCP 工具更新內容。
- **命令**（節錄）：安裝／卸載 MCP 設定、將檔案送入佇列、重設 token 約略統計（見 `package.json` `contributes.commands`）。
- **資料目錄**：有工作區時為 `<工作區>/.cursor/messenger-data`；無工作區時為擴充 global storage 下之路徑（與 MCP 設定中的 `MESSENGER_DATA_DIR` 需一致）。

## 開發

| 指令 | 用途 |
|------|------|
| `bun run compile` | 建置 MCP bundle 與擴充／webview |
| `bun run compile:mcp` | 僅建置 `dist/mcp-server.mjs` |
| `bun run compile:ext` | 僅建置 `dist/extension.js`、`dist/webview.js` |
| `bun run package` | 建置並以 `vsce` 打出 `.vsix` |

建置選項集中於 [`esbuild.config.mjs`](./esbuild.config.mjs)。

### CI

[`.github/workflows/package.yml`](./.github/workflows/package.yml) 在推送 **`main`** 時會編譯並上傳 **Actions 成品（Artifact）`vsix`**，可在該次 workflow 執行頁下載；**這不會自動出現在 GitHub 的 Releases 頁**。

若要出現在 **Releases**：在 GitHub 網頁 **建立並發佈 Release**（會附加 `.vsix`），或推送版本標籤，例如：

```bash
git tag v9.0.0 && git push origin v9.0.0
```

符合 `v*` 的 tag 會觸發 workflow **建立 Release 並附上** 打包好的 `.vsix`。

## 疑難排解

- **Webview 無法載入**（含 Service Worker 相關訊息）：多為編輯器內嵌 Chromium 已知類別問題，可嘗試關閉所有視窗後重開、更新 Cursor；詳見 [microsoft/vscode#125993](https://github.com/microsoft/vscode/issues/125993)。
- **MCP 未出現**：確認已執行「安裝 MCP 設定」且已重啟；並檢查 `.cursor/mcp.json` 是否指向正確的伺服器啟動命令與 `MESSENGER_DATA_DIR`。

## 授權

本專案以 [**AGPL-3.0**](./LICENSE) 授權發布；使用、修改與散布請遵守該授權條款。

## 連結

- **英文說明**：[README.md](./README.md)
- **維護者**：[運作流程](./PROJECT.md) · [AI 協作指南](./AGENTS.md)
