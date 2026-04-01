/**
 * MCP stdio 伺服器（同目錄 `index.ts`）內部型別：工具 handler 用的上下文，以及回傳給模型的 content 片段形狀。
 *
 * **與「AI 如何選工具」的關係：** 客戶端（如 Cursor）是依 `index.ts` 裡 `registerTool` 的 `description` 與 `inputSchema`（Zod）決定如何呼叫工具；本檔**不**重複那些 schema，避免雙處維護。若要改模型看到的參數說明，請改 `index.ts` 對應工具的 `description` / `.describe()`。
 *
 * **本專案三個工具（摘要，詳見 `index.ts`）：**
 * - `check_messages` — 可選 `reply` 推送本輪完整回覆至外掛；**阻塞**直到側欄佇列有訊息或逾時；佇列內容會轉成下方 {@link ContentPart}。每輪結束前應再呼叫一次以接下一則佇列。
 * - `send_progress` — 必填 `progress`；**非阻塞**，立即寫入側欄進度。
 * - `ask_question` — 必填 `questions`；需求不清、複雜或多方案時向使用者提問。**阻塞**直到側欄作答或逾時。
 */
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";

/**
 * 純文字片段：對應 MCP content item `type: "text"`，會進入模型上下文。
 * `check_messages` 回傳的佇列內容多為此類（外加可選 {@link ImagePart}）。
 */
export type TextPart = { type: "text"; text: string };

/**
 * 圖片片段：base64 + MIME，對應 MCP 內嵌圖片；由側欄貼上／佇列中的圖片訊息產生。
 */
export type ImagePart = { type: "image"; data: string; mimeType: string };

/** `registerTool` handler 可回傳的 `content` 陣列元素型別。 */
export type ContentPart = TextPart | ImagePart;

/**
 * `registerTool` 第二參數 handler 的 `extra`：用於長等待時發送進度／日誌（見 `emitHeartbeat`）。
 *
 * - `signal` — 客戶端中止時應停止輪詢。
 * - `_meta?.progressToken` — 若存在，優先透過 `sendNotification(notifications/progress)` 回報等待中狀態。
 */
export type ToolExtra = RequestHandlerExtra<never, ServerNotification>;
