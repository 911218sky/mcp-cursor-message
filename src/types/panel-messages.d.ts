/**
 * 側欄 Webview ↔ extension host 的 `postMessage` 型別（雙向）。
 */
import type { AnswerEntry } from "./ipc-json";

/** Webview → extension（`vscode.postMessage`），與 `src/webview/main.ts` 送出欄位一致。 */
export type WebviewHostMessage =
	| { type: "ready" }
	| { type: "setUiLanguage"; value?: string }
	| { type: "sendText"; text?: string }
	| {
			type: "sendComposer";
			text?: string;
			images?: { base64?: string; mime?: string }[];
			base64?: string;
			mime?: string;
	  }
	| { type: "resetTokenStats" }
	| { type: "removeQueueItem"; index?: unknown }
	| { type: "submitAnswer"; answers?: AnswerEntry[] }
	| { type: "cancelQuestion" }
	| { type: "ackReply" }
	| { type: "pickQueueFiles"; kind?: "image" | "file" };

/** MCP `ask_question` 寫入 `question.json` 後，經 `pushState` 帶入頂欄問答卡。 */
export type QuestionOption = { id: string; label: string };
export type QuestionItem = {
	id: string;
	question: string;
	options: QuestionOption[];
	allow_multiple: boolean;
};
export type QuestionPayload = {
	id: string;
	questions: QuestionItem[];
	timestamp?: string;
};

/** 與 `readTokenStats` 顯示欄位對齊（webview 不重複 import node 模組）。 */
export type PanelTokenStats = {
	totalEstimated?: number;
	lastMessageEstimated?: number;
	updatedAt?: string;
};

/** 頂欄語言選單與 `mcpMessenger.uiLanguage` 設定值。 */
export type PanelUiLanguageSetting = "en" | "zh" | "auto";

/** Extension → webview（`pushStateToPanel` 目前唯一送出的形狀）。 */
export type ExtensionPanelStateMessage = {
	type: "state";
	uiLocale: "en" | "zh";
	uiLanguageSetting: PanelUiLanguageSetting;
	question: unknown;
	reply: { content?: string } | null;
	queue: unknown;
	tokenStats?: PanelTokenStats;
};
