/**
 * Webview 偏好設定存取層：
 * - 統一管理 localStorage / sessionStorage 鍵名
 * - 統一提供型別安全的讀寫 API
 * - 避免 main.ts 夾雜過多儲存細節
 */
export type FontSizeSetting = "sm" | "md" | "lg";
export type ReplyDefaultSetting = "show" | "hide";

const FONT_SIZE_STORAGE_KEY = "mcpMessengerFontSize";
const REPLY_DEFAULT_STORAGE_KEY = "mcpMessengerReplyDefault";
const HISTORY_PANEL_COLLAPSED_KEY = "mcpMessengerHistoryPanelCollapsed";
const REPLY_PANEL_COLLAPSED_KEY = "mcpMessengerReplyPanelCollapsed";

export const DEFAULT_FONT_SIZE: FontSizeSetting = "md";
export const DEFAULT_REPLY_DEFAULT: ReplyDefaultSetting = "show";

/** 讀取字級偏好；若資料不存在或無效則回預設值。 */
export function loadFontSizeSetting(): FontSizeSetting {
	try {
		const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
		if (raw === "sm" || raw === "md" || raw === "lg") return raw;
	} catch {
		/* ignore storage errors */
	}
	return DEFAULT_FONT_SIZE;
}

/** 寫入字級偏好（跨 session 保留）。 */
export function saveFontSizeSetting(setting: FontSizeSetting): void {
	try {
		localStorage.setItem(FONT_SIZE_STORAGE_KEY, setting);
	} catch {
		/* ignore storage errors */
	}
}

/** 讀取回覆卡預設顯示策略（顯示/隱藏）。 */
export function loadReplyDefaultSetting(): ReplyDefaultSetting {
	try {
		const raw = localStorage.getItem(REPLY_DEFAULT_STORAGE_KEY);
		if (raw === "show" || raw === "hide") return raw;
	} catch {
		/* ignore storage errors */
	}
	return DEFAULT_REPLY_DEFAULT;
}

/** 寫入回覆卡預設顯示策略（跨 session 保留）。 */
export function saveReplyDefaultSetting(setting: ReplyDefaultSetting): void {
	try {
		localStorage.setItem(REPLY_DEFAULT_STORAGE_KEY, setting);
	} catch {
		/* ignore storage errors */
	}
}

/** 讀取歷史卡於本次 session 的收合狀態。 */
export function loadHistoryPanelCollapsed(): boolean {
	try {
		return sessionStorage.getItem(HISTORY_PANEL_COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

/** 寫入歷史卡於本次 session 的收合狀態。 */
export function saveHistoryPanelCollapsed(next: boolean): void {
	try {
		sessionStorage.setItem(HISTORY_PANEL_COLLAPSED_KEY, next ? "1" : "0");
	} catch {
		/* ignore storage errors */
	}
}

/** 讀取回覆卡於本次 session 的收合狀態。 */
export function loadReplyPanelCollapsed(): boolean {
	try {
		return sessionStorage.getItem(REPLY_PANEL_COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

/** 寫入回覆卡於本次 session 的收合狀態。 */
export function saveReplyPanelCollapsed(next: boolean): void {
	try {
		sessionStorage.setItem(REPLY_PANEL_COLLAPSED_KEY, next ? "1" : "0");
	} catch {
		/* ignore storage errors */
	}
}
