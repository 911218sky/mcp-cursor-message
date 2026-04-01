# mcp-cursor-message（繁體中文）

MCP 旁路對話：在側欄以佇列與 MCP 工具（`check_messages`、`ask_question` 等）銜接 Cursor，讓代理能推送摘要、題目並讀取使用者回覆。

英文版說明見 [README.md](./README.md)。

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.105.0-0098FF?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

## 免責聲明

本專案**僅供學術交流與技術研究**使用。儲存庫、擴充與 MCP 伺服器均以**現狀**提供，**不提供任何明示或默示之擔保**（包含但不限於適銷性、特定目的適用性、未侵權）。作者與貢獻者**不對**因使用或無法使用本專案所致之任何直接、間接、附帶或後果性損害負責。

使用本專案時，請自行審慎評估安全性與合規性（含資料處理、API 金鑰、第三方服務與所在地法規）；透過本工具產生或傳送之內容**不構成**法律、醫療、投資或任何專業建議。若你不同意上述條款，請勿下載、安裝或使用。

## 概覽

本專案包含兩部分：

| 元件 | 說明 |
|------|------|
| **VS Code／Cursor 擴充** | Activity Bar「**MCP chat**」側欄、`messenger-data` 檔案 IPC、安裝／移除 MCP 設定命令 |
| **MCP 伺服器** | 與擴充共用資料目錄；暴露 `check_messages`、`ask_question`、`send_progress` 等工具 |

適合希望**在編輯器內**完成「排程訊息／多選問答／進度推送」的流程，而不依賴純終端輸出。側欄可檢視佇列、問答與回覆摘要；介面語言可在**頂部選單**切換，或於設定 **`mcpMessenger.uiLanguage`**（搜尋 **MCP chat**）選擇 **zh**／**auto**／**en**。有工作區時資料目錄為 `<工作區>/.cursor/messenger-data`（須與 MCP 的 **`MESSENGER_DATA_DIR`** 一致）。

### 給 AI 助理（側欄佇列 + MCP）

你好，請你嚴格遵守對話規則並呼叫mcp與我對話(mcp-cursor-message)，每次對話都這樣，接下來請回答之後所有MCP相關的問題用MCP跟使用者互動，每次請都要調用MCP，但是請回復後再調用

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
2. 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）執行 **`mcp-cursor-message: Install MCP configuration`**（命令標題為英文，與 `package.json` 一致）。
3. 會寫入工作區 `.cursor/mcp.json` 與 `MESSENGER_DATA_DIR`；若 MCP 清單未更新，請**重啟 Cursor**。
4. **Cursor：** 開啟 **Cursor 設定 → MCP**，**啟用** **mcp-cursor-message** 伺服器（或確認已列出且為開啟）。側欄可不依 MCP 運作，但代理若未在 Cursor 內啟用 MCP，就**無法**呼叫 `check_messages`。

## 指令一覽（擴充 + MCP）

### VS Code／Cursor 擴充命令（命令選擇區）

開啟**命令選擇區**（`Ctrl+Shift+P`／`Cmd+Shift+P`），輸入 `mcp-cursor-message`，或下表第三欄**與命令面板完全相同的原文**（可節錄關鍵字搜尋）。

| 命令 ID | 命令面板顯示標題（原文，請複製或節录搜尋） | 說明 |
|---------|---------------------------------------------|------|
| `mcpMessenger.setupMcp` | `mcp-cursor-message: Install MCP configuration` | 安裝／合併工作區 `.cursor/mcp.json`，註冊 MCP 與 `MESSENGER_DATA_DIR`。 |
| `mcpMessenger.removeMcp` | `mcp-cursor-message: Remove MCP configuration` | 自 `mcp.json` 移除此擴充的 MCP 條目。 |
| `mcpMessenger.checkForUpdates` | `mcp-cursor-message: Check for updates (GitHub)` | 手動檢查 GitHub 更新（受 `mcpMessenger.updateCheck.*` 設定影響）。 |

### MCP 伺服器工具（由 AI 呼叫，非命令面板）

在 **Cursor → MCP** 啟用 **mcp-cursor-message** 後，由**對話中的代理**依工具名稱呼叫；使用者無需在命令面板輸入這些名稱。

| 工具名稱 | 說明 |
|----------|------|
| `check_messages` | 可選參數 `reply`（Markdown）將回覆推到側欄；呼叫後**會阻塞**直到佇列有訊息或逾時。每輪對話結束前通常應**最後**再呼叫。 |
| `send_progress` | 必填 `progress`（Markdown）；**不阻塞**，用於更新側欄進度文字。 |
| `ask_question` | 必填 `questions`；**會阻塞**直到使用者在側欄完成作答（單選／多選與可選文字說明）。 |

## 設定（MCP chat）

設定項皆在 **`mcpMessenger`** 命名空間下。開啟方式：**設定** → 搜尋 **MCP chat**；或直接編輯使用者／工作區的 **`settings.json`**。

| 設定鍵 | 類型 | 預設值 | 說明 |
|--------|------|--------|------|
| `mcpMessenger.uiLanguage` | `en`／`zh`／`auto` | `en` | 側欄 Webview 介面語言；**`auto`** 會依編輯器介面語系決定（非英文介面時傾向中文）。 |
| `mcpMessenger.mergeEverythingClaudeCode.enabled` | 布林 | `true` | **`true`**（預設）時會把內建或工作區 **`everything-claude-code/.cursor`** 種子合併進 **`<工作區>/.cursor`**（僅補缺檔、不覆寫既有檔）；於啟動、切換資料夾或開啟此設定時執行。設 **`false`** 可完全關閉合併。 |
| `mcpMessenger.updateCheck.enabled` | 布林 | `true` | **`false`** 時完全不執行更新檢查（含命令面板手動檢查），也不會向 GitHub 發請求。 |
| `mcpMessenger.updateCheck.intervalHours` | 數字（≥ 1） | `12` | 背景自動檢查的間隔（小時）。 |
| `mcpMessenger.updateCheck.startupDelaySeconds` | 數字（≥ 0） | `15` | 啟動後延遲幾秒再做**第一次**檢查；設 **`0`** 表示啟動後立即檢查。 |
| `mcpMessenger.updateCheck.repo` | 字串 | `911218sky/mcp-cursor-message` | 要查 GitHub Releases 的儲存庫，格式 **`擁有者/專案名`**。 |
| `mcpMessenger.updateCheck.versionCompare` | `patch`／`minor`／`major`／`off` | `minor` | **是否較新**一律以完整 **主版.次版.修訂** 與 `releases/latest` 比對。**`patch`** — 背景檢查只要較新就提示；**`minor`**（預設）— 僅 **次版或主版** 遞增才提示（略過僅修訂）；**`major`** — 僅 **主版** 遞增才提示；**`off`** — 不檢查。**手動**「Check for updates」**不套用** patch/minor/major 篩選（`off` 或 `enabled: false` 仍阻擋）。舊值 **`full`**／**`majorMinor`** 會對應為 **`patch`**／**`minor`**。 |

```json
{
  "mcpMessenger.uiLanguage": "auto",
  "mcpMessenger.updateCheck.enabled": true,
  "mcpMessenger.updateCheck.versionCompare": "minor",
  "mcpMessenger.updateCheck.repo": "911218sky/mcp-cursor-message"
}
```

英文版設定說明見 [README.md](./README.md)。

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
- **MCP 未出現**／工具從未執行：確認已執行 **`mcp-cursor-message: Install MCP configuration`** 且已重啟；在 **Cursor 設定 → MCP** 啟用該伺服器；並檢查 `.cursor/mcp.json` 是否指向正確的伺服器啟動命令與 `MESSENGER_DATA_DIR`。

## 授權

本專案以 [**AGPL-3.0**](./LICENSE) 授權發布；使用、修改與散布請遵守該授權條款。

## 連結

- [README.md](./README.md)（英文版說明）
- [運作流程](./PROJECT.md) · [AI 協作指南](./AGENTS.md)
