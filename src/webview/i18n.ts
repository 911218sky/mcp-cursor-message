/**
 * 側欄 Webview 介面字串（繁中／英文）。
 */
export type UiLocale = "zh" | "en";

export type UiStrings = {
	topbarTitle: string;
	/** 含 `<code>check_messages</code>`，以 `innerHTML` 套用。 */
	topbarSubHtml: string;
	tabMain: string;
	tabToken: string;
	questionCardTitle: string;
	replyCardTitle: string;
	replyAck: string;
	queueTitle: string;
	queueEmpty: string;
	tokenCardTitle: string;
	tokenHint: string;
	tokenTotal: string;
	tokenLast: string;
	tokenReset: string;
	composerLabel: string;
	composerHint: string;
	btnImage: string;
	btnFile: string;
	composerAttachHint: string;
	btnSend: string;
	placeholderInput: string;
	qOtherPlaceholder: string;
	qCancel: string;
	qSubmit: string;
	removeQueue: string;
	removeQueueTitle: string;
	removeQueueAria: string;
	previewImage: string;
	previewFilePrefix: string;
	/** 頂欄語言選單 */
	langLabel: string;
	langOptEn: string;
	langOptZh: string;
	langOptAuto: string;
	/** 移除輸入區暫存貼圖（aria） */
	pendingPasteRemoveAria: string;
};

export const UI: Record<UiLocale, UiStrings> = {
	zh: {
		topbarTitle: "MCP 對話",
		topbarSubHtml: "使用 <code>check_messages</code> 收訊",
		tabMain: "內容",
		tabToken: "Token",
		questionCardTitle: "需要你的選擇",
		replyCardTitle: "AI 回覆",
		replyAck: "已閱",
		queueTitle: "待送佇列",
		queueEmpty: "佇列為空",
		tokenCardTitle: "佇列 Token（約略）",
		tokenHint:
			"統計本側欄送入佇列的文字／圖片／檔案，非 Cursor 官方帳單。",
		tokenTotal: "累計",
		tokenLast: "上一則",
		tokenReset: "重設統計",
		composerLabel: "傳給 AI",
		composerHint:
			"Enter 送出 · Shift+Enter 換行 · 貼圖會先暫存，按「送出」才送出",
		btnImage: "圖片",
		btnFile: "檔案",
		composerAttachHint: "選擇器加入附件 · Ctrl+V 貼圖暫存於輸入區",
		btnSend: "送出",
		placeholderInput: "輸入訊息…",
		qOtherPlaceholder: "補充說明（可選）",
		qCancel: "取消",
		qSubmit: "提交回答",
		removeQueue: "撤銷",
		removeQueueTitle:
			"自佇列移除此則（尚未被 check_messages 取出前）",
		removeQueueAria: "撤銷佇列訊息",
		previewImage: "[圖片]",
		previewFilePrefix: "[檔案]",
		langLabel: "語言",
		langOptEn: "English",
		langOptZh: "繁體中文",
		langOptAuto: "自動（編輯器）",
		pendingPasteRemoveAria: "移除暫存圖片",
	},
	en: {
		topbarTitle: "MCP chat",
		topbarSubHtml: "Pull via <code>check_messages</code>",
		tabMain: "Content",
		tabToken: "Token",
		questionCardTitle: "Your choice needed",
		replyCardTitle: "AI reply",
		replyAck: "Dismiss",
		queueTitle: "Outbound queue",
		queueEmpty: "Queue is empty",
		tokenCardTitle: "Queue tokens (estimate)",
		tokenHint:
			"Approximate tokens for sidebar-queued text/images/files—not Cursor billing.",
		tokenTotal: "Total",
		tokenLast: "Last",
		tokenReset: "Reset stats",
		composerLabel: "To AI",
		composerHint:
			"Enter to send · Shift+Enter newline · pasted images stay until you press Send",
		btnImage: "Image",
		btnFile: "File",
		composerAttachHint: "Pick attachments · Ctrl+V in box stages pasted image",
		btnSend: "Send",
		placeholderInput: "Type a message…",
		qOtherPlaceholder: "Optional note",
		qCancel: "Cancel",
		qSubmit: "Submit",
		removeQueue: "Remove",
		removeQueueTitle:
			"Remove from queue (only before check_messages consumes it)",
		removeQueueAria: "Remove queued message",
		previewImage: "[Image]",
		previewFilePrefix: "[File]",
		langLabel: "Lang",
		langOptEn: "English",
		langOptZh: "繁體中文",
		langOptAuto: "Auto (editor)",
		pendingPasteRemoveAria: "Remove staged image",
	},
};

export function strings(loc: UiLocale): UiStrings {
	return UI[loc] ?? UI.zh;
}
