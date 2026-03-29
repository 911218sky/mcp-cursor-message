# AI 代理／自動化協作指南

本文件給 **AI 編碼代理**與 **自動化流程** 使用：如何在儲存庫內安全地修改、測試與回報，而不破壞擴充與 MCP 之間的契約。終端使用者請讀 [README.md](./README.md)；架構細節請讀 [PROJECT.md](./PROJECT.md)。

## 指引原則

1. **單一事實來源**：IPC 檔名、語意與 `MESSENGER_DATA_DIR` 行為以 [PROJECT.md](./PROJECT.md)（流程章節與「資料夾裡的檔案」速查表）與程式碼為準；修改時同步更新 **PROJECT.md** 與相關型別（`src/ipc-types.ts`、`mcp-server/index.ts`）。
2. **小步提交**：優先最小可行 diff；避免與議題無關的重構、大規模格式化。
3. **建置驗證**：變更後在儲存庫根目錄執行 `bun run compile`；若動到打包或 `package.json`，執行 `bun run package` 確認可產出 `.vsix`。

## 環境與指令

| 指令 | 時機 |
|------|------|
| `bun install` | 初次或鎖檔變更後 |
| `bun run compile` | 修改 `src/`、`mcp-server/`、`esbuild.config.mjs` 後 |
| `bun run package` | 驗證 VSIX、或發佈前 |
| `node esbuild.config.mjs mcp` | 僅需重建 MCP bundle 時 |

套件管理器與版本見 `package.json` 的 `packageManager` 欄位。

## 修改邊界（常見陷阱）

- **`mcp-config.ts` 與 `mcp-server/index.ts`**：`SERVER_KEY`／`MCP_DISPLAY_NAME`／`mcp.json` 鍵名必須一致。
- **Webview**：UI 在 `src/webview/main.ts`；HTML 模板與 CSP／nonce 在擴充載入邏輯中。新 DOM id 需與 TS 中的選取器同步。
- **佇列與 XSS**：側欄輸出視為不可信資料，維持既有的跳脫／安全插入模式。
- **授權**：本專案為 **AGPL-3.0-only**；勿引入與其不相容之依賴而不標註。

## 透過本專案 MCP 與使用者協作時

當 Cursor 已載入 **mcp-cursor-message** MCP 伺服器且使用者依賴側欄佇列時：

- 每輪對使用者回覆後，應呼叫工具 **`check_messages`**（可附 `reply` 摘要），以利外掛與下一則佇列訊息銜接。
- 需阻斷式多選／問答時使用 **`ask_question`**；長步驟可穿插 **`send_progress`**。
- 具體參數 schema 以執行中 MCP 伺服器註冊為準（開發時可對照 `mcps/.../tools/*.json` 描述檔，若本機有同步產生）。

## 文件與 PR

- 使用者可見行為變更：更新 **README.md**（必要時 **INSTALL.md** 僅保留導連）。
- 架構／IPC／程序圖變更：更新 **PROJECT.md**。
- PR 描述請說明**行為影響**（擴充、MCP、或僅 CI／文件），無需贅字。

## 版本與發佈（Semantic Versioning）

`package.json` 的 **`version`** 採 **SemVer `MAJOR.MINOR.PATCH`**（例：`9.0.0`）。發 GitHub Release／打 tag 前，**tag 名稱須與此版號一致**（例：`v9.0.1` 對應 `9.0.1`），見 [`.github/workflows/package.yml`](./.github/workflows/package.yml)。

| 位 | 何時遞增 | 範例 |
|----|----------|------|
| **PATCH**（最後一位） | 修正 bug、小調整、**向後相容**且不改公開契約 | `9.0.0` → `9.0.1` |
| **MINOR**（中間） | **較大功能**或行為擴充，仍盡量**向後相容**（舊 MCP／舊外掛升級後不應壞） | `9.0.1` → `9.1.0` |
| **MAJOR**（第一位） | **不相容變更**：IPC 檔格式、`MESSENGER_DATA_DIR` 語意、MCP 工具簽名、`mcp.json` 鍵名、擴充對使用者可見 breaking 等 | `9.1.0` → `10.0.0` |

發佈前檢查：`bun run package` 成功；若動到 IPC／工具，已更新 **PROJECT.md** 與相關型別，並在 Release note 註明升級提示。

## 參考連結

- [README.md](./README.md) — 安裝與使用
- [PROJECT.md](./PROJECT.md) — 運作流程與 IPC 速查
- [esbuild.config.mjs](./esbuild.config.mjs) — 建置進入點
