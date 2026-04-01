/**
 * 側欄 Webview 腳本（打包為 dist/webview.js）。
 * 負責渲染佇列／問答／摘要，並以 `postMessage` 與 extension host 通訊。
 */
import { strings, type UiLocale } from "./i18n";
import { markdownToSafeHtml } from "./markdown";
import {
	DEFAULT_FONT_SIZE,
	loadFontSizeSetting,
	loadHistoryPanelCollapsed,
	saveFontSizeSetting,
	saveHistoryPanelCollapsed,
	type FontSizeSetting,
} from "./prefs";
import type {
	ExtensionPanelStateMessage,
	PanelHistoryEntry,
	PanelTokenStats,
	PanelUiLanguageSetting,
	QuestionPayload,
	WebviewHostMessage,
} from "../types/panel-messages";

/** VS Code 在 Webview 內注入；僅能呼叫一次，取得與 extension host 通訊的 API。 */
declare function acquireVsCodeApi(): {
	postMessage(message: WebviewHostMessage): void;
};

const vscode = acquireVsCodeApi();

/** 舊版僅存於 webview localStorage 時之鍵；若 `history.json` 為空則單次遷移後清除。 */
const LEGACY_HISTORY_STORAGE_KEY = "mcpMessengerHistory";
const DEFAULT_LOCALE: UiLocale = "en";
const EMPTY_MARK = "—";
const IMAGE_MIME_FALLBACK = "image/png";
const QUESTION_OTHER_SELECTOR = ".q-other[data-qid=\"%QID%\"]";

type PendingPaste = { b64: string; mime: string };
type QuestionAnswer = { questionId: string; selected: string[]; other: string };
type QueuePreviewItem = {
	type?: string;
	content?: string;
	path?: string;
	caption?: string;
};
type QueueEditState = {
	index: number;
	kind: "text" | "image";
	seed: string;
};
type AiRunState = "idle" | "processing" | "done";
type HistoryRole = PanelHistoryEntry["role"];
const HISTORY_COLLAPSE_MIN_CHARS = 260;
const HISTORY_COLLAPSE_MIN_LINES = 6;
/** 歷史／摘要預設折疊時只顯示前段純文字，展開後才做完整 Markdown 解析（減少 DOM 與 marked 成本）。 */
const LAZY_PREVIEW_MAX_CHARS = 360;

/** 目前介面語系（由 extension 依設定推送；首次載入預設英文以符合擴充預設）。 */
let uiLocale: UiLocale = DEFAULT_LOCALE;
/** 最近一次佇列資料，保留給後續語系切換或重繪擴充用。 */
let lastQueue: unknown;
/** 與 `mcpMessenger.uiLanguage` 同步（頂欄選單值）。 */
let lastUiLanguageSetting: PanelUiLanguageSetting = "en";
/** 輸入框內 Ctrl+V 暫存之圖片（按「送出」才進佇列；可複數張）。 */
let pendingPastes: PendingPaste[] = [];
let curQuestion: QuestionPayload | null = null;
/**
 * 使用者按下取消/提交後，`ask_question` 會在短時間內清掉 `question.json`。
 * 在 watcher debounce 與 IPC 推送的競速視窗裡，webview 可能會收到「仍存在舊題目」的 state。
 * 這裡做樂觀抑制：在很短的時間內遇到相同 question id 時不重新顯示，避免看起來「關不掉」。
 */
let optimisticHiddenQuestionId: string | null = null;
let optimisticHiddenAt = 0;
const OPTIMISTIC_HIDE_MS = 3000;
const selectedAnswers: Record<string, string[]> = {};
/** 與 `messenger-data/history.json` 同步（經 `state` 與 `saveHistory`）。 */
let historyEntries: PanelHistoryEntry[] = [];
/** 用於避免同一則 reply 在 state 重推時重複寫入歷史。 */
let lastSeenReplyContent = "";
/** 送出新一輪後，直到收到新的 AI 回覆前都維持 processing。 */
let awaitingAssistantReply = false;
let lastUserSendAt = 0;
let isHistoryPanelCollapsed = false;
let queueEditState: QueueEditState | null = null;

function S() {
	return strings(uiLocale);
}

/** 套用靜態 Chrome 文案（頂欄、輸入區等）；動態區塊由後續 render* 更新。 */
function applyChrome(loc: UiLocale): void {
	uiLocale = loc;
	const t = S();
	chromeTopbarTitle.textContent = t.topbarTitle;
	chromeTopbarSub.innerHTML = t.topbarSubHtml;
	chromeQuestionCardTitle.textContent = t.questionCardTitle;
	chromeHistoryTitle.textContent = t.historyTitle;
	btnClearHistory.textContent = t.historyClear;
	btnToggleHistoryPanel.textContent = isHistoryPanelCollapsed
		? t.historyPanelExpand
		: t.historyPanelCollapse;
	chromeQueueTitle.textContent = t.queueTitle;
	chromeComposerLabel.textContent = t.composerLabel;
	chromeComposerHint.textContent = t.composerHint;
	chromeBtnImageLabel.textContent = t.btnImage;
	chromeBtnFileLabel.textContent = t.btnFile;
	chromeComposerAttachHint.textContent = t.composerAttachHint;
	chromeSendLabel.textContent = t.btnSend;
	chromeSettingsBtn.textContent = t.settingsButton;
	chromeSettingsTitle.textContent = t.settingsTitle;
	btnCloseSettings.textContent = t.settingsClose;
	msgInput.placeholder = t.placeholderInput;
	updateLanguageSelect(lastUiLanguageSetting);
	updateFontSizeSelect(currentFontSize);
	renderTokenStats(lastTokenStats);
	renderAiRunStatus(lastQueue, lastSeenReplyContent);
}

/** 頂欄語言選單文案與目前設定值。 */
function updateLanguageSelect(setting: PanelUiLanguageSetting): void {
	const t = S();
	chromeLangLabel.textContent = t.langLabel;
	uiLanguageSelect.options[0]!.textContent = t.langOptEn;
	uiLanguageSelect.options[1]!.textContent = t.langOptZh;
	uiLanguageSelect.options[2]!.textContent = t.langOptAuto;
	uiLanguageSelect.value = setting;
}

/** 同步頂欄字級選單文案與目前值。 */
function updateFontSizeSelect(setting: FontSizeSetting): void {
	const t = S();
	chromeFontSizeLabel.textContent = t.fontSizeLabel;
	fontSizeSelect.options[0]!.textContent = t.fontSizeSm;
	fontSizeSelect.options[1]!.textContent = t.fontSizeMd;
	fontSizeSelect.options[2]!.textContent = t.fontSizeLg;
	fontSizeSelect.value = setting;
}

/** 以 id 取得 DOM 節點（不存在時會拋錯，與面板 HTML 約定同步）。 */
const $ = (id: string) => document.getElementById(id)!;

/** 主內容容器。 */
const panelMain = $("panelMain");
const mainScroll = $("mainScroll");

/** 問答與回覆卡片區塊。 */
const questionCard = $("questionCard");
const questionBody = $("questionBody");
const historyList = $("historyList");
const btnClearHistory = $("btnClearHistory") as HTMLButtonElement;
const historyCard = btnClearHistory.closest(".card--history");
const btnToggleHistoryPanel = $("btnToggleHistoryPanel") as HTMLButtonElement;

/** 佇列預覽與 token 顯示區。 */
const queuePreview = $("queuePreview");
const tokenInline = $("tokenInline");
const aiRunStatus = $("aiRunStatus");

/** 輸入與貼圖組件。 */
const msgInput = $("msgInput") as HTMLTextAreaElement;
const sendBtn = $("sendBtn") as HTMLButtonElement;
const composerPasteStrip = $("composerPasteStrip");
const composerPasteThumbs = $("composerPasteThumbs");

/** 頂欄互動控制。 */
const uiLanguageSelect = $("uiLanguageSelect") as HTMLSelectElement;
const fontSizeSelect = $("fontSizeSelect") as HTMLSelectElement;
const btnOpenSettings = $("btnOpenSettings") as HTMLButtonElement;
const settingsDialog = $("settingsDialog");
const btnCloseSettings = $("btnCloseSettings") as HTMLButtonElement;

/** 靜態文案節點（由 applyChrome 依語系刷新）。 */
const chromeTopbarTitle = $("chromeTopbarTitle");
const chromeTopbarSub = $("chromeTopbarSub");
const chromeQuestionCardTitle = $("chromeQuestionCardTitle");
const chromeHistoryTitle = $("chromeHistoryTitle");
const chromeQueueTitle = $("chromeQueueTitle");
const chromeComposerLabel = $("chromeComposerLabel");
const chromeComposerHint = $("chromeComposerHint");
const chromeBtnImageLabel = $("chromeBtnImageLabel");
const chromeBtnFileLabel = $("chromeBtnFileLabel");
const chromeComposerAttachHint = $("chromeComposerAttachHint");
const chromeSendLabel = $("chromeSendLabel");
const chromeLangLabel = $("chromeLangLabel");
const chromeFontSizeLabel = $("chromeFontSizeLabel");
const chromeSettingsBtn = $("chromeSettingsBtn");
const chromeSettingsTitle = $("chromeSettingsTitle");
let currentFontSize: FontSizeSetting = DEFAULT_FONT_SIZE;
let lastTokenStats: PanelTokenStats | undefined;
const FONT_SCALE_MAP: Record<FontSizeSetting, string> = {
	sm: "0.92",
	md: "1",
	lg: "1.1",
};

/** 套用字級到 `<body data-font-size>`，並持久化設定。 */
function applyFontSize(setting: FontSizeSetting): void {
	currentFontSize = setting;
	document.body.setAttribute("data-font-size", setting);
	document.body.style.setProperty("--mcp-ui-zoom", FONT_SCALE_MAP[setting]);
	saveFontSizeSetting(setting);
}

/** 將字串轉為可安全插入 HTML 的文字（防 XSS）。 */
function esc(s: string): string {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		/* fall through */
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.left = "-9999px";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(ta);
		return ok;
	} catch {
		return false;
	}
}

/** 摺疊預覽用：截斷純文字（不經 Markdown），必要時加省略號。 */
function historyPreviewPlain(text: string, maxChars: number): string {
	const t = text.trim();
	if (t.length <= maxChars) return t;
	return `${t.slice(0, maxChars).trimEnd()}…`;
}

/** 以「幾個關鍵字串」組合簽章，判斷 history 是否真的變動。 */
function historyRenderSignature(entries: PanelHistoryEntry[]): string {
	const len = entries.length;
	if (len === 0) return "0";
	const last = entries[len - 1];
	const lastSnip =
		last.content.length > 80 ? `${last.content.slice(0, 80)}…` : last.content;
	const prev = len >= 2 ? entries[len - 2] : null;
	const prevSnip = prev
		? prev.content.length > 60
			? `${prev.content.slice(0, 60)}…`
			: prev.content
		: "";
	return `${len}|${last.role}|${last.ts}|${lastSnip}|${prev?.role ?? ""}|${prev?.ts ?? ""}|${prevSnip}`;
}

/** 隱藏問答卡並清除當前題目狀態。 */
function hideQuestionCard(): void {
	questionCard.classList.add("hidden");
	curQuestion = null;
	optimisticHiddenQuestionId = null;
	optimisticHiddenAt = 0;
}

/** 取得指定題目的「其他補充」輸入框。 */
function getQuestionOtherInput(questionId: string): HTMLInputElement | null {
	return document.querySelector(
		QUESTION_OTHER_SELECTOR.replace("%QID%", questionId)
	) as HTMLInputElement | null;
}

/**
 * 依 MCP 寫入的 `question.json` 渲染問答卡；無題目時隱藏區塊。
 * 會重綁選項點擊與提交／取消按鈕。
 */
function renderQuestion(q: QuestionPayload | null): void {
	if (
		!q ||
		!Array.isArray(q.questions) ||
		q.questions.length === 0
	) {
		hideQuestionCard();
		return;
	}

	// 樂觀抑制：在「取消/提交剛發出」但 state 尚未反映完成時，避免舊題目閃回。
	if (
		optimisticHiddenQuestionId &&
		q.id === optimisticHiddenQuestionId &&
		Date.now() - optimisticHiddenAt < OPTIMISTIC_HIDE_MS
	) {
		questionCard.classList.add("hidden");
		curQuestion = null;
		return;
	}

	curQuestion = q;
	Object.keys(selectedAnswers).forEach((k) => delete selectedAnswers[k]);
	const tr = S();
	const blocks = q.questions.map((qi) => {
		selectedAnswers[qi.id] = [];
		const optionsHtml = qi.options
			.map((opt) => {
				const multi = qi.allow_multiple ? " multi" : "";
				return `<div class="q-opt${multi}" data-qid="${esc(qi.id)}" data-oid="${esc(opt.id)}"><span class="check"></span><span>${esc(opt.label)}</span></div>`;
			})
			.join("");
		return `<div class="q-block" data-qid="${esc(qi.id)}"><div class="q-text">${esc(qi.question)}</div><div class="q-options">${optionsHtml}</div><input class="q-other" data-qid="${esc(qi.id)}" placeholder="${esc(tr.qOtherPlaceholder)}"></div>`;
	});
	const actionsHtml = `<div class="q-actions"><button type="button" class="btn btn-ghost btn-sm q-actions-skip" id="btnSkipQ">${esc(tr.qSkip)}</button><button type="button" class="btn btn-warn btn-sm" id="btnSubmitQ">${esc(tr.qSubmit)}</button></div>`;
	questionBody.innerHTML = blocks.join("") + actionsHtml;
	questionCard.classList.remove("hidden");

	questionBody.querySelectorAll(".q-opt").forEach((el) => {
		el.addEventListener("click", () => toggleOpt(el as HTMLElement));
	});
	$("btnSkipQ").addEventListener("click", cancelQ);
	$("btnSubmitQ").addEventListener("click", submitQ);
	questionCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** 切換單選／多選選項的選取狀態，並更新 `.selected` 樣式。 */
function toggleOpt(el: HTMLElement): void {
	const qid = el.getAttribute("data-qid");
	const oid = el.getAttribute("data-oid");
	if (!curQuestion || !qid || !oid) return;
	const qi = curQuestion.questions.find((q) => q.id === qid);
	if (!qi) return;
	let arr = selectedAnswers[qid] ?? [];
	const idx = arr.indexOf(oid);
	if (qi.allow_multiple) {
		if (idx > -1) arr.splice(idx, 1);
		else arr.push(oid);
	} else {
		arr = idx > -1 ? [] : [oid];
		el.parentElement?.querySelectorAll(".q-opt").forEach((n) => {
			n.classList.remove("selected");
		});
	}
	selectedAnswers[qid] = arr;
	el.classList.toggle("selected", arr.indexOf(oid) > -1);
}

/** 收集各題選項與補充說明，透過 `submitAnswer` 交給擴充寫入 `answer.json`。 */
function submitQ(): void {
	if (!curQuestion) return;
	const dismissedId = curQuestion.id;
	const answers: QuestionAnswer[] = [];
	for (const qi of curQuestion.questions) {
		const otherInput = getQuestionOtherInput(qi.id);
		answers.push({
			questionId: qi.id,
			selected: selectedAnswers[qi.id] ?? [],
			other: otherInput?.value.trim() ?? "",
		});
	}
	vscode.postMessage({ type: "submitAnswer", answers });
	hideQuestionCard();
	optimisticHiddenQuestionId = dismissedId;
	optimisticHiddenAt = Date.now();
}

/** 使用者跳過或關閉問答（Esc／遮罩）：送空答案讓 MCP 端可結束等待。 */
function cancelQ(): void {
	const dismissedId = curQuestion?.id ?? null;
	vscode.postMessage({ type: "cancelQuestion" });
	hideQuestionCard();
	optimisticHiddenQuestionId = dismissedId;
	optimisticHiddenAt = Date.now();
}

/** 依 `lastSeenReplyContent` 對齊「最後一則 AI」內容，供與 `reply.json` 去重。 */
function refreshLastSeenReplyFromHistory(): void {
	lastSeenReplyContent = "";
	for (let i = historyEntries.length - 1; i >= 0; i--) {
		const row = historyEntries[i];
		if (row?.role === "assistant") {
			lastSeenReplyContent = row.content;
			break;
		}
	}
}

/** 與擴充 `normalizePanelHistory` 對齊，驗證 `state` 帶入之歷史。 */
function normalizeHistoryPayload(raw: unknown): PanelHistoryEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: PanelHistoryEntry[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const row = item as Partial<PanelHistoryEntry>;
		if (row.role !== "user" && row.role !== "assistant") continue;
		if (typeof row.content !== "string" || !row.content.trim()) continue;
		const ts = typeof row.ts === "number" ? row.ts : Date.now();
		out.push({ role: row.role, content: row.content.trim(), ts });
	}
	return out;
}

/** 請擴充寫入 `history.json` 並於成功後經 watcher 重推 `state`。 */
function persistHistory(): void {
	vscode.postMessage({ type: "saveHistory", entries: historyEntries });
}

/**
 * 舊版歷史僅在 localStorage；若磁碟尚無資料則遷移一次並請擴充落檔。
 */
function tryMigrateHistoryFromLocalStorage(): void {
	if (historyEntries.length > 0) return;
	try {
		let raw = localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
		if (!raw) {
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k?.startsWith(`${LEGACY_HISTORY_STORAGE_KEY}:`)) {
					raw = localStorage.getItem(k);
					if (raw) break;
				}
			}
		}
		if (!raw) return;
		const migrated = normalizeHistoryPayload(JSON.parse(raw) as unknown);
		if (migrated.length === 0) return;
		historyEntries = migrated;
		localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const k = localStorage.key(i);
			if (k?.startsWith(`${LEGACY_HISTORY_STORAGE_KEY}:`)) localStorage.removeItem(k);
		}
		persistHistory();
		refreshLastSeenReplyFromHistory();
		renderHistory();
		scrollHistoryToBottom();
	} catch {
		/* ignore */
	}
}

/** 重繪歷史並保留目前捲動位置，避免新增訊息時畫面跳動。 */
function renderHistory(): void {
	const tr = S();
	const prevScrollTop = mainScroll.scrollTop;
	if (historyEntries.length === 0) {
		historyList.innerHTML = `<p class="muted">${esc(tr.historyEmpty)}</p>`;
		mainScroll.scrollTop = prevScrollTop;
		return;
	}
	const html = historyEntries
		.map((item, i) => {
			const who =
				item.role === "user" ? esc(tr.historyUserLabel) : esc(tr.historyAiLabel);
			const longByChars = item.content.length > HISTORY_COLLAPSE_MIN_CHARS;
			const longByLines =
				item.content.split(/\r?\n/).filter((line) => line.trim().length > 0).length >
				HISTORY_COLLAPSE_MIN_LINES;
			const isLatest = i === historyEntries.length - 1;
			// 性能：大量 history 時，非最新 assistant 不急著做 markdown 解析；改為預設折疊（lazy）。
			const shouldCollapse =
				item.role === "assistant" ? !isLatest : (longByChars || longByLines) && !isLatest;
			const previewPlain = historyPreviewPlain(
				item.content,
				LAZY_PREVIEW_MAX_CHARS,
			);
			const previewHtml = esc(previewPlain);
			let bodyInner: string;
			let bodyClass: string;
			let bodyAttrs = "";
			if (shouldCollapse) {
				bodyInner = previewHtml;
				bodyClass =
					item.role === "assistant"
						? "history-item-body reply-content--md is-collapsed"
						: "history-item-body is-collapsed";
				bodyAttrs = ` data-history-index="${i}" data-lazy="${item.role}"`;
			} else if (item.role === "assistant") {
				bodyInner = markdownToSafeHtml(item.content);
				bodyClass = "history-item-body reply-content--md";
			} else {
				bodyInner = esc(item.content).replace(/\n/g, "<br>");
				bodyClass = "history-item-body";
			}
			const toggleBtn = shouldCollapse
				? `<button type="button" class="history-toggle" data-expanded="false" aria-expanded="false">${esc(tr.historyExpand)}</button>`
				: "";
			return `<div class="history-item history-item--${item.role}"><div class="history-item-head"><span>${who}</span><div class="history-head-actions"><button type="button" class="history-copy" data-copy-index="${i}" aria-label="${esc(tr.copyHistory)}">${esc(tr.copyHistory)}</button><button type="button" class="history-delete" data-delete-index="${i}" aria-label="${esc(tr.deleteHistoryAria)}">${esc(tr.deleteHistory)}</button></div></div><div class="${bodyClass}"${bodyAttrs}>${bodyInner}</div>${toggleBtn}</div>`;
		})
		.join("");
	historyList.innerHTML = html;
	mainScroll.scrollTop = prevScrollTop;
}

/** 新增歷史訊息後自動捲到底，預設顯示最新內容。 */
function scrollHistoryToBottom(): void {
	historyList.scrollTop = historyList.scrollHeight;
}

/** 切換「整個歷史卡片」展開/收合，並記住本次 session 狀態。 */
function setHistoryPanelCollapsed(next: boolean): void {
	isHistoryPanelCollapsed = next;
	historyCard?.classList.toggle("is-collapsed", next);
	const tr = S();
	btnToggleHistoryPanel.setAttribute("aria-expanded", String(!next));
	btnToggleHistoryPanel.textContent = next
		? tr.historyPanelExpand
		: tr.historyPanelCollapse;
	saveHistoryPanelCollapsed(next);
}

historyList.addEventListener("click", (ev) => {
	const target = ev.target as HTMLElement | null;
	const copyBtn = target?.closest?.(".history-copy") as HTMLButtonElement | null;
	if (copyBtn) {
		const idx = Number(copyBtn.getAttribute("data-copy-index"));
		if (!Number.isInteger(idx) || idx < 0 || idx >= historyEntries.length) return;
		const row = historyEntries[idx];
		void copyToClipboard(row.content).then((ok) => {
			const tr = S();
			if (!ok) return;
			copyBtn.textContent = tr.copyHistoryDone;
			window.setTimeout(() => {
				copyBtn.textContent = tr.copyHistory;
			}, 1200);
		});
		return;
	}
	const deleteBtn = target?.closest?.(".history-delete") as HTMLButtonElement | null;
	if (deleteBtn) {
		const idx = Number(deleteBtn.getAttribute("data-delete-index"));
		if (!Number.isInteger(idx) || idx < 0 || idx >= historyEntries.length) return;
		historyEntries.splice(idx, 1);
		persistHistory();
		refreshLastSeenReplyFromHistory();
		renderHistory();
		return;
	}
	const btn = target?.closest?.(".history-toggle") as HTMLButtonElement | null;
	if (!btn) return;
	const item = btn.closest(".history-item");
	const body = item?.querySelector(".history-item-body");
	if (!(body instanceof HTMLElement)) return;
	const tr = S();
	const isExpanded = btn.getAttribute("data-expanded") === "true";
	const nextExpanded = !isExpanded;
	if (nextExpanded) {
		const lazy = body.getAttribute("data-lazy");
		if (lazy === "assistant" || lazy === "user") {
			const idx = Number(body.getAttribute("data-history-index"));
			if (Number.isInteger(idx) && idx >= 0 && idx < historyEntries.length) {
				const entry = historyEntries[idx];
				if (entry.role === "assistant" && lazy === "assistant") {
					body.innerHTML = markdownToSafeHtml(entry.content);
					body.classList.add("reply-content--md");
				} else if (entry.role === "user" && lazy === "user") {
					body.innerHTML = esc(entry.content).replace(/\n/g, "<br>");
					body.classList.remove("reply-content--md");
				}
				body.removeAttribute("data-lazy");
				body.removeAttribute("data-history-index");
			}
		}
	}
	body.classList.toggle("is-collapsed", !nextExpanded);
	btn.setAttribute("data-expanded", String(nextExpanded));
	btn.setAttribute("aria-expanded", String(nextExpanded));
	btn.textContent = nextExpanded ? tr.historyCollapse : tr.historyExpand;
});

/** 追加一筆歷史（你/AI），並立即持久化與更新畫面。 */
function appendHistory(role: HistoryRole, content: string): void {
	const text = content.trim();
	if (!text) return;
	historyEntries.push({ role, content: text, ts: Date.now() });
	persistHistory();
	renderHistory();
	scrollHistoryToBottom();
}

/** 將佇列預覽為簡短列表（文字截斷、圖片／檔案標籤）。 */
function renderQueuePreview(queue: unknown): void {
	const tr = S();
	if (!Array.isArray(queue) || queue.length === 0) {
		queuePreview.innerHTML = `<p class="muted">${esc(tr.queueEmpty)}</p>`;
		return;
	}
	const html = (queue as QueuePreviewItem[]).map((it, i) => {
		const tp = it.type ?? "text";
		let preview: string;
		let hasEdit = false;
		let editKind: "text" | "image" | "" = "";
		if (tp === "text") {
			preview = (it.content ?? "").slice(0, 80);
			hasEdit = true;
			editKind = "text";
		} else if (tp === "image") {
			const cap = String(it.caption ?? "").trim();
			preview = cap
				? `${tr.previewImage} · ${cap.slice(0, 60)}`
				: tr.previewImage;
			hasEdit = true;
			editKind = "image";
		} else {
			preview = `${tr.previewFilePrefix} ${String(it.path ?? "").split(/[/\\]/).pop() ?? ""}`;
		}
		const editState = queueEditState;
		const editing =
			editState && editState.index === i && editState.kind === editKind;
		if (editing) {
			return `<div class="qp" role="group"><div class="qp-edit-wrap"><textarea class="qp-edit-input" data-edit-input="${i}" rows="2">${esc(editState.seed)}</textarea></div><div class="qp-actions"><button type="button" class="qp-save" data-index="${i}" data-edit-kind="${editKind}">${esc(tr.editQueueSave)}</button><button type="button" class="qp-cancel" data-index="${i}">${esc(tr.editQueueCancel)}</button><button type="button" class="qp-remove" data-index="${i}" title="${esc(tr.removeQueueTitle)}" aria-label="${esc(tr.removeQueueAria)}">${esc(tr.removeQueue)}</button></div></div>`;
		}
		const editBtn = hasEdit
			? `<button type="button" class="qp-edit" data-index="${i}" data-edit-kind="${editKind}" title="${esc(tr.editQueueTitle)}">${esc(tr.editQueue)}</button>`
			: "";
		return `<div class="qp" role="group"><span class="qp-text">${esc(preview)}</span><div class="qp-actions">${editBtn}<button type="button" class="qp-remove" data-index="${i}" title="${esc(tr.removeQueueTitle)}" aria-label="${esc(tr.removeQueueAria)}">${esc(tr.removeQueue)}</button></div></div>`;
	});
	queuePreview.innerHTML = html.join("");
	if (queueEditState) {
		const input = queuePreview.querySelector(
			`.qp-edit-input[data-edit-input="${queueEditState.index}"]`
		) as HTMLTextAreaElement | null;
		if (input) {
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
		}
	}
}

/** 顯示側欄送入佇列之 token 約略累計（由擴充估算，非 Cursor 帳單實值）。 */
function renderTokenStats(ts: PanelTokenStats | undefined): void {
	lastTokenStats = ts;
	const t = S();
	if (!ts || typeof ts.totalEstimated !== "number") {
		tokenInline.textContent = t.tokenInlineOnly.replace("{total}", EMPTY_MARK);
		return;
	}
	const total = String(ts.totalEstimated);
	const last =
		typeof ts.lastMessageEstimated === "number"
			? String(ts.lastMessageEstimated)
			: EMPTY_MARK;
	tokenInline.textContent = t.tokenInline.replace("{total}", total).replace("{last}", last);
}

function deriveAiRunState(
	queue: unknown,
	replyContent: string,
	replyKind?: "progress" | "final",
): AiRunState {
	if (awaitingAssistantReply) return "processing";
	if (Array.isArray(queue) && queue.length > 0) return "processing";
	if (replyContent.trim() && replyKind !== "progress") return "done";
	const last = historyEntries[historyEntries.length - 1];
	if (last?.role === "assistant") return "done";
	return "idle";
}

function renderAiRunStatus(
	queue: unknown,
	replyContent: string,
	replyKind?: "progress" | "final",
): void {
	const t = S();
	const state = deriveAiRunState(queue, replyContent, replyKind);
	aiRunStatus.classList.remove("is-processing", "is-done");
	if (state === "processing") {
		aiRunStatus.classList.add("is-processing");
		aiRunStatus.textContent = t.aiStatusProcessing;
		return;
	}
	if (state === "done") {
		aiRunStatus.classList.add("is-done");
		aiRunStatus.textContent = t.aiStatusDone;
		return;
	}
	aiRunStatus.textContent = t.aiStatusIdle;
}

/**
 * 接收 extension host 送來的訊息（`webview.postMessage`）。
 * `type === "state"` 時為完整狀態同步，對應擴充端 `pushStateToPanel`。
 */
window.addEventListener("message", (ev) => {
	const raw = ev.data as { type?: string };
	if (raw.type !== "state") return;
	const m = raw as ExtensionPanelStateMessage;
		const prevHistorySig = historyRenderSignature(historyEntries);
	const prevLastSeenReplyContent = lastSeenReplyContent;
		const nextHistoryEntries = normalizeHistoryPayload(m.history ?? []);
		const nextHistorySig = historyRenderSignature(nextHistoryEntries);
		const historyChanged = prevHistorySig !== nextHistorySig;
		let historyRenderedDuringMessage = false;
		historyEntries = nextHistoryEntries;
	if (historyEntries.length === 0) {
		tryMigrateHistoryFromLocalStorage();
	}
	refreshLastSeenReplyFromHistory();
	lastQueue = m.queue;
	lastUiLanguageSetting = m.uiLanguageSetting;
	applyChrome(m.uiLocale);
	renderQuestion((m.question as QuestionPayload | null) ?? null);
	const incomingReply = (m.reply?.content ?? "").trim();
	const incomingReplyKind = m.reply?.kind;
	if (incomingReply && incomingReply !== prevLastSeenReplyContent) {
		const last = historyEntries[historyEntries.length - 1];
		if (
			incomingReplyKind !== "progress" &&
			(!last || last.role !== "assistant" || last.content !== incomingReply)
		) {
			appendHistory("assistant", incomingReply);
			historyRenderedDuringMessage = true;
		}
	}
	if (awaitingAssistantReply) {
		const latestAssistantTs = [...historyEntries]
			.reverse()
			.find((row) => row.role === "assistant")?.ts;
		if (
			(
				incomingReply &&
				incomingReply !== prevLastSeenReplyContent &&
				incomingReplyKind !== "progress"
			) ||
			(typeof latestAssistantTs === "number" && latestAssistantTs > lastUserSendAt)
		) {
			awaitingAssistantReply = false;
		}
	}
	lastSeenReplyContent = incomingReply;
	renderQueuePreview(m.queue);
	renderAiRunStatus(m.queue, incomingReply, incomingReplyKind);
	renderTokenStats(m.tokenStats);
		if (historyChanged && !historyRenderedDuringMessage) {
			renderHistory();
		}
});

// 允許點擊問答遮罩背景與 `Esc` 也能取消（不會造成 XSS，僅觸發既有 cancelQ）。
questionCard.addEventListener("click", (ev) => {
	if (questionCard.classList.contains("hidden")) return;
	if (ev.target !== questionCard) return;
	cancelQ();
});
document.addEventListener("keydown", (ev) => {
	if (ev.key !== "Escape") return;
	if (questionCard.classList.contains("hidden")) return;
	cancelQ();
});

/** 更新輸入區下方暫存貼圖縮圖列（尚未送出）。 */
function renderPendingPaste(): void {
	const tr = S();
	if (pendingPastes.length === 0) {
		composerPasteStrip.classList.add("hidden");
		composerPasteThumbs.innerHTML = "";
		return;
	}
	composerPasteStrip.classList.remove("hidden");
	const html = pendingPastes
		.map((p, i) => {
			return `<div class="composer-paste-thumb-wrap"><img class="composer-paste-thumb" alt="" src="data:${esc(p.mime)};base64,${esc(p.b64)}" /><button type="button" class="composer-paste-remove" data-index="${i}" aria-label="${esc(tr.pendingPasteRemoveAria)}">×</button></div>`;
		})
		.join("");
	composerPasteThumbs.innerHTML = html;
}

function clearPendingPaste(): void {
	pendingPastes = [];
	renderPendingPaste();
	updateSend();
}

/** 依輸入或暫存貼圖，啟用或停用「送出」按鈕。 */
function updateSend(): void {
	const hasText = !!msgInput.value.trim();
	sendBtn.disabled = !hasText && pendingPastes.length === 0;
}

msgInput.addEventListener("input", updateSend);

/** 將剪貼簿中的圖檔讀成 base64，供 `pendingPastes` 暫存。 */
function readClipboardImageFile(file: File): Promise<PendingPaste | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const comma = dataUrl.indexOf(",");
			const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
			if (!b64) {
				resolve(null);
				return;
			}
			resolve({
				b64,
				mime: file.type || IMAGE_MIME_FALLBACK,
			});
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(file);
	});
}

/** 輸入框內 Ctrl+V 貼上剪貼簿圖片時先暫存，按「送出」再進佇列（可一次多張）。 */
msgInput.addEventListener("paste", (e: ClipboardEvent) => {
	const items = e.clipboardData?.items;
	if (!items?.length) return;
	const files: File[] = [];
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it.type.startsWith("image/")) continue;
		const file = it.getAsFile();
		if (file) files.push(file);
	}
	if (!files.length) return;
	e.preventDefault();
	void Promise.all(files.map(readClipboardImageFile)).then((results) => {
		const next = results.filter(
			(r): r is PendingPaste => r !== null
		);
		if (!next.length) return;
		pendingPastes = pendingPastes.concat(next);
		renderPendingPaste();
		updateSend();
	});
});

/** Enter：送出；Shift+Enter：換行（不送出）。 */
msgInput.addEventListener("keydown", (e) => {
	if (e.key !== "Enter") return;
	if (e.shiftKey) return;
	e.preventDefault();
	doSend();
});

/** 讀取輸入框／暫存貼圖並送至擴充，成功後清空。 */
function doSend(): void {
	const text = msgInput.value.trim();
	const tr = S();
	if (pendingPastes.length === 0 && !text) return;
	awaitingAssistantReply = true;
	lastUserSendAt = Date.now();
	if (pendingPastes.length > 0) {
		const imageNote = tr.historyImageNote.replace(
			"{count}",
			String(pendingPastes.length)
		);
		appendHistory(
			"user",
			text ? `${text}\n${imageNote}` : imageNote
		);
		vscode.postMessage({
			type: "sendComposer",
			text,
			images: pendingPastes.map((p) => ({
				base64: p.b64,
				mime: p.mime,
			})),
		});
		clearPendingPaste();
	} else {
		appendHistory("user", text);
		vscode.postMessage({ type: "sendText", text });
	}
	msgInput.value = "";
	updateSend();
	renderAiRunStatus(lastQueue, lastSeenReplyContent);
}

sendBtn.addEventListener("click", doSend);

/** 由擴充開啟系統檔案選擇器，將本機路徑以 `image`／`file` 類型加入佇列。 */
$("btnPickImage").addEventListener("click", () => {
	vscode.postMessage({ type: "pickQueueFiles", kind: "image" });
});
$("btnPickFile").addEventListener("click", () => {
	vscode.postMessage({ type: "pickQueueFiles", kind: "file" });
});

btnClearHistory.addEventListener("click", () => {
	historyEntries = [];
	persistHistory();
	renderHistory();
});

btnToggleHistoryPanel.addEventListener("click", () => {
	setHistoryPanelCollapsed(!isHistoryPanelCollapsed);
});

btnOpenSettings.addEventListener("click", () => {
	settingsDialog.classList.remove("hidden");
});

btnCloseSettings.addEventListener("click", () => {
	settingsDialog.classList.add("hidden");
});

settingsDialog.addEventListener("click", (ev) => {
	if (ev.target === settingsDialog) settingsDialog.classList.add("hidden");
});

/** 佇列預覽列：事件委派至 `.qp-remove`，避免每次重繪佇列時重綁多顆按鈕。 */
queuePreview.addEventListener("click", (e) => {
	const t = e.target as HTMLElement | null;
	const editBtn = t?.closest?.(".qp-edit") as HTMLElement | null;
	if (editBtn) {
		e.preventDefault();
		const idx = Number(editBtn.getAttribute("data-index"));
		const kind = String(editBtn.getAttribute("data-edit-kind") ?? "");
		if (!Number.isInteger(idx) || idx < 0) return;
		const current = (lastQueue as QueuePreviewItem[] | undefined)?.[idx];
		if (!current) return;
		const seed =
			kind === "image"
				? String(current.caption ?? "")
				: String(current.content ?? "");
		queueEditState = {
			index: idx,
			kind: kind === "image" ? "image" : "text",
			seed,
		};
		renderQueuePreview(lastQueue);
		return;
	}
	const saveBtn = t?.closest?.(".qp-save") as HTMLElement | null;
	if (saveBtn) {
		e.preventDefault();
		const idx = Number(saveBtn.getAttribute("data-index"));
		const kind = String(saveBtn.getAttribute("data-edit-kind") ?? "");
		if (!Number.isInteger(idx) || idx < 0) return;
		const input = queuePreview.querySelector(
			`.qp-edit-input[data-edit-input="${idx}"]`
		) as HTMLTextAreaElement | null;
		if (!input) return;
		const next = input.value.trim();
		if (kind === "image") {
			vscode.postMessage({ type: "updateQueueItem", index: idx, caption: next });
		} else {
			if (!next) return;
			vscode.postMessage({ type: "updateQueueItem", index: idx, content: next });
		}
		queueEditState = null;
		renderQueuePreview(lastQueue);
		return;
	}
	const cancelBtn = t?.closest?.(".qp-cancel") as HTMLElement | null;
	if (cancelBtn) {
		e.preventDefault();
		queueEditState = null;
		renderQueuePreview(lastQueue);
		return;
	}
	const btn = t?.closest?.(".qp-remove") as HTMLElement | null;
	if (!btn) return;
	e.preventDefault();
	const idx = Number(btn.getAttribute("data-index"));
	if (!Number.isInteger(idx) || idx < 0) return;
	vscode.postMessage({ type: "removeQueueItem", index: idx });
});

panelMain.classList.remove("hidden");
isHistoryPanelCollapsed = loadHistoryPanelCollapsed();
setHistoryPanelCollapsed(isHistoryPanelCollapsed);
renderHistory();

/** 暫存貼圖列：移除單張預覽（僅前端狀態，未送出前可刪）。 */
composerPasteStrip.addEventListener("click", (ev) => {
	const t = ev.target as HTMLElement | null;
	const btn = t?.closest?.(".composer-paste-remove") as HTMLElement | null;
	if (!btn) return;
	const idx = Number(btn.getAttribute("data-index"));
	if (!Number.isInteger(idx) || idx < 0 || idx >= pendingPastes.length) return;
	pendingPastes.splice(idx, 1);
	renderPendingPaste();
	updateSend();
});

/** 變更頂欄語言後通知擴充寫入設定，下次 `state` 會帶回正確 `uiLocale`。 */
uiLanguageSelect.addEventListener("change", () => {
	const v = uiLanguageSelect.value;
	if (v === "en" || v === "zh" || v === "auto") {
		vscode.postMessage({ type: "setUiLanguage", value: v });
	}
});

fontSizeSelect.addEventListener("change", () => {
	const v = fontSizeSelect.value;
	if (v === "sm" || v === "md" || v === "lg") {
		applyFontSize(v);
		updateFontSizeSelect(v);
	}
});

applyFontSize(loadFontSizeSetting());
applyChrome(uiLocale);

/** Webview 載入完成後通知擴充，觸發首次 `pushState`。 */
vscode.postMessage({ type: "ready" });