/**
 * 與 MCP 佇列／問答 JSON 共用的型別（與 `mcp-server/index.ts` 約定一致）。
 * 擴充與 MCP 伺服器皆讀寫相同檔案格式，型別需保持同步。
 */

/** 佇列單則訊息：`text` 為側欄輸入；`image`／`file` 可由擴充或外掛寫入。 */
export type QueueMsg =
	| { type: "text"; content?: string }
	| { type: "image"; path?: string; caption?: string }
	| { type: "file"; path?: string; suffix?: string };

/** MCP `ask_question` 回寫至 `answer.json` 時，每一題對應一筆。 */
export type AnswerEntry = {
	questionId?: string;
	selected?: string[];
	other?: string;
};
