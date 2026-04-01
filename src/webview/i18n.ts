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
	replyPanelExpand: string;
	replyPanelCollapse: string;
	replyAck: string;
	replyExpand: string;
	replyCollapse: string;
	historyTitle: string;
	historyClear: string;
	historyPanelExpand: string;
	historyPanelCollapse: string;
	historyEmpty: string;
	historyUserLabel: string;
	historyAiLabel: string;
	historyExpand: string;
	historyCollapse: string;
	historyImageNote: string;
	queueTitle: string;
	queueEmpty: string;
	tokenCardTitle: string;
	tokenHint: string;
	tokenTotal: string;
	tokenLast: string;
	tokenReset: string;
	tokenInline: string;
	tokenInlineOnly: string;
	composerLabel: string;
	composerHint: string;
	aiStatusIdle: string;
	aiStatusProcessing: string;
	aiStatusDone: string;
	btnImage: string;
	btnFile: string;
	composerAttachHint: string;
	btnSend: string;
	placeholderInput: string;
	qOtherPlaceholder: string;
	/** 不作答而結束問答（寫入空答案，等同舊版「取消」） */
	qSkip: string;
	qSubmit: string;
	removeQueue: string;
	editQueue: string;
	editQueueTitle: string;
	editQueueSave: string;
	editQueueCancel: string;
	removeQueueTitle: string;
	removeQueueAria: string;
	copyHistory: string;
	copyHistoryDone: string;
	deleteHistory: string;
	deleteHistoryAria: string;
	previewImage: string;
	previewFilePrefix: string;
	/** 頂欄語言選單 */
	langLabel: string;
	langOptEn: string;
	langOptZh: string;
	langOptAuto: string;
	fontSizeLabel: string;
	fontSizeSm: string;
	fontSizeMd: string;
	fontSizeLg: string;
	settingsButton: string;
	settingsTitle: string;
	settingsClose: string;
	replyDefaultLabel: string;
	replyDefaultShow: string;
	replyDefaultHide: string;
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
		replyPanelExpand: "顯示回覆",
		replyPanelCollapse: "隱藏回覆",
		replyAck: "已閱",
		replyExpand: "展開回覆",
		replyCollapse: "收合回覆",
		historyTitle: "對話歷史",
		historyClear: "清除全部",
		historyPanelExpand: "展開歷史",
		historyPanelCollapse: "收合歷史",
		historyEmpty: "目前沒有歷史訊息",
		historyUserLabel: "你",
		historyAiLabel: "AI",
		historyExpand: "展開",
		historyCollapse: "收合",
		historyImageNote: "[圖片 {count} 張]",
		queueTitle: "待送佇列",
		queueEmpty: "佇列為空",
		tokenCardTitle: "佇列 Token（約略）",
		tokenHint:
			"統計本側欄送入佇列的文字／圖片／檔案，非 Cursor 官方帳單。",
		tokenTotal: "累計",
		tokenLast: "上一則",
		tokenReset: "重設統計",
		tokenInline: "Token：總計 {total} · 上一則 {last}",
		tokenInlineOnly: "Token：總計 {total}",
		composerLabel: "傳給 AI",
		composerHint:
			"Enter 送出 · Shift+Enter 換行 · 貼圖會先暫存，按「送出」才送出",
		aiStatusIdle: "AI 狀態：待命",
		aiStatusProcessing: "AI 狀態：處理中",
		aiStatusDone: "AI 狀態：已完成",
		btnImage: "圖片",
		btnFile: "檔案",
		composerAttachHint: "選擇器加入附件 · Ctrl+V 貼圖暫存於輸入區",
		btnSend: "送出",
		placeholderInput: "輸入訊息…",
		qOtherPlaceholder: "補充說明（可選）",
		qSkip: "跳過",
		qSubmit: "提交回答",
		removeQueue: "撤銷",
		editQueue: "編輯",
		editQueueTitle: "編輯此則待送內容",
		editQueueSave: "儲存",
		editQueueCancel: "取消",
		removeQueueTitle:
			"自佇列移除此則（尚未被 check_messages 取出前）",
		removeQueueAria: "撤銷佇列訊息",
		copyHistory: "複製",
		copyHistoryDone: "已複製",
		deleteHistory: "刪除",
		deleteHistoryAria: "刪除此則歷史訊息",
		previewImage: "[圖片]",
		previewFilePrefix: "[檔案]",
		langLabel: "語言",
		langOptEn: "English",
		langOptZh: "繁體中文",
		langOptAuto: "自動（編輯器）",
		fontSizeLabel: "字級",
		fontSizeSm: "小",
		fontSizeMd: "中",
		fontSizeLg: "大",
		settingsButton: "設定",
		settingsTitle: "設定",
		settingsClose: "關閉",
		replyDefaultLabel: "回覆卡",
		replyDefaultShow: "預設顯示",
		replyDefaultHide: "預設隱藏",
		pendingPasteRemoveAria: "移除暫存圖片",
	},
	en: {
		topbarTitle: "MCP chat",
		topbarSubHtml: "Pull via <code>check_messages</code>",
		tabMain: "Content",
		tabToken: "Token",
		questionCardTitle: "Your choice needed",
		replyCardTitle: "AI reply",
		replyPanelExpand: "Show reply",
		replyPanelCollapse: "Hide reply",
		replyAck: "Dismiss",
		replyExpand: "Expand reply",
		replyCollapse: "Collapse reply",
		historyTitle: "Conversation history",
		historyClear: "Clear all",
		historyPanelExpand: "Show history",
		historyPanelCollapse: "Hide history",
		historyEmpty: "No history yet",
		historyUserLabel: "You",
		historyAiLabel: "AI",
		historyExpand: "Expand",
		historyCollapse: "Collapse",
		historyImageNote: "[{count} image(s)]",
		queueTitle: "Outbound queue",
		queueEmpty: "Queue is empty",
		tokenCardTitle: "Queue tokens (estimate)",
		tokenHint:
			"Approximate tokens for sidebar-queued text/images/files—not Cursor billing.",
		tokenTotal: "Total",
		tokenLast: "Last",
		tokenReset: "Reset stats",
		tokenInline: "Token: total {total} · last {last}",
		tokenInlineOnly: "Token: total {total}",
		composerLabel: "To AI",
		composerHint:
			"Enter to send · Shift+Enter newline · pasted images stay until you press Send",
		aiStatusIdle: "AI status: idle",
		aiStatusProcessing: "AI status: working",
		aiStatusDone: "AI status: done",
		btnImage: "Image",
		btnFile: "File",
		composerAttachHint: "Pick attachments · Ctrl+V in box stages pasted image",
		btnSend: "Send",
		placeholderInput: "Type a message…",
		qOtherPlaceholder: "Optional note",
		qSkip: "Skip",
		qSubmit: "Submit",
		removeQueue: "Remove",
		editQueue: "Edit",
		editQueueTitle: "Edit queued content",
		editQueueSave: "Save",
		editQueueCancel: "Cancel",
		removeQueueTitle:
			"Remove from queue (only before check_messages consumes it)",
		removeQueueAria: "Remove queued message",
		copyHistory: "Copy",
		copyHistoryDone: "Copied",
		deleteHistory: "Delete",
		deleteHistoryAria: "Delete this history message",
		previewImage: "[Image]",
		previewFilePrefix: "[File]",
		langLabel: "Lang",
		langOptEn: "English",
		langOptZh: "繁體中文",
		langOptAuto: "Auto (editor)",
		fontSizeLabel: "Text",
		fontSizeSm: "Small",
		fontSizeMd: "Medium",
		fontSizeLg: "Large",
		settingsButton: "Settings",
		settingsTitle: "Settings",
		settingsClose: "Close",
		replyDefaultLabel: "Reply card",
		replyDefaultShow: "Default show",
		replyDefaultHide: "Default hide",
		pendingPasteRemoveAria: "Remove staged image",
	},
};

export function strings(loc: UiLocale): UiStrings {
	return UI[loc] ?? UI.zh;
}
