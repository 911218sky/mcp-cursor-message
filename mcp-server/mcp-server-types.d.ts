/**
 * MCP stdio 進入點（`index.ts`）專用型別：工具 handler 上下文、模型內容片段。
 */
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";

/** MCP 工具回傳給模型的文字片段。 */
export type TextPart = { type: "text"; text: string };

/** 圖片以 base64 一併送入模型上下文。 */
export type ImagePart = { type: "image"; data: string; mimeType: string };

export type ContentPart = TextPart | ImagePart;

/** 註冊工具 handler 的 `extra` 引數（心跳／通知用）。 */
export type ToolExtra = RequestHandlerExtra<never, ServerNotification>;
