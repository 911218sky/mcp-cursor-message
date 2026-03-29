/**
 * 側欄 Webview 腳本（打包為 dist/webview.js）。
 * 負責渲染佇列／問答／摘要，並以 `postMessage` 與 extension host 通訊。
 */
import { strings, type UiLocale } from "./i18n";
import { markdownToSafeHtml } from "./markdown";
import type {
	ExtensionPanelStateMessage,
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

/** sessionStorage 鍵：記住使用者上次停留在「內容」或「Token」分頁。 */
const TAB_STORAGE_KEY = "mcpMessengerMainTab";
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

/** 目前介面語系（由 extension 依設定推送；首次載入預設英文以符合擴充預設）。 */
let uiLocale: UiLocale = DEFAULT_LOCALE;
/** 最近一次佇列資料，保留給後續語系切換或重繪擴充用。 */
let lastQueue: unknown;
/** 與 `mcpMessenger.uiLanguage` 同步（頂欄選單值）。 */
let lastUiLanguageSetting: PanelUiLanguageSetting = "en";
/** 輸入框內 Ctrl+V 暫存之圖片（按「送出」才進佇列；可複數張）。 */
let pendingPastes: PendingPaste[] = [];
let curQuestion: QuestionPayload | null = null;
const selectedAnswers: Record<string, string[]> = {};

function S() {
	return strings(uiLocale);
}

/** 套用靜態 Chrome 文案（頂欄、分頁、輸入區等）；動態區塊由後續 render* 更新。 */
function applyChrome(loc: UiLocale): void {
	uiLocale = loc;
	const t = S();
	chromeTopbarTitle.textContent = t.topbarTitle;
	chromeTopbarSub.innerHTML = t.topbarSubHtml;
	chromeTabMain.textContent = t.tabMain;
	chromeTabToken.textContent = t.tabToken;
	chromeQuestionCardTitle.textContent = t.questionCardTitle;
	chromeReplyTitle.textContent = t.replyCardTitle;
	replyAck.textContent = t.replyAck;
	chromeQueueTitle.textContent = t.queueTitle;
	chromeTokenCardTitle.textContent = t.tokenCardTitle;
	chromeTokenHint.textContent = t.tokenHint;
	chromeTokenTotalLabel.textContent = t.tokenTotal;
	chromeTokenLastLabel.textContent = t.tokenLast;
	btnResetTokens.textContent = t.tokenReset;
	chromeComposerLabel.textContent = t.composerLabel;
	chromeComposerHint.textContent = t.composerHint;
	chromeBtnImageLabel.textContent = t.btnImage;
	chromeBtnFileLabel.textContent = t.btnFile;
	chromeComposerAttachHint.textContent = t.composerAttachHint;
	chromeSendLabel.textContent = t.btnSend;
	msgInput.placeholder = t.placeholderInput;
	updateLanguageSelect(lastUiLanguageSetting);
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

/** 以 id 取得 DOM 節點（不存在時會拋錯，與面板 HTML 約定同步）。 */
const $ = (id: string) => document.getElementById(id)!;

/** 主內容/Token 分頁容器與頁籤按鈕。 */
const panelMain = $("panelMain");
const panelToken = $("panelToken");
const tabMain = $("tabMain");
const tabToken = $("tabToken");

/** 問答與回覆卡片區塊。 */
const questionCard = $("questionCard");
const questionBody = $("questionBody");
const replyCard = $("replyCard");
const replyContent = $("replyContent");

/** 佇列預覽與 token 顯示區。 */
const queuePreview = $("queuePreview");
const tokenTotal = $("tokenTotal");
const tokenLast = $("tokenLast");

/** 輸入與貼圖組件。 */
const msgInput = $("msgInput") as HTMLTextAreaElement;
const sendBtn = $("sendBtn") as HTMLButtonElement;
const composerPasteStrip = $("composerPasteStrip");
const composerPasteThumbs = $("composerPasteThumbs");

/** 頂欄互動控制。 */
const uiLanguageSelect = $("uiLanguageSelect") as HTMLSelectElement;
const replyAck = $("replyAck");
const btnResetTokens = $("btnResetTokens");

/** 靜態文案節點（由 applyChrome 依語系刷新）。 */
const chromeTopbarTitle = $("chromeTopbarTitle");
const chromeTopbarSub = $("chromeTopbarSub");
const chromeTabMain = $("chromeTabMain");
const chromeTabToken = $("chromeTabToken");
const chromeQuestionCardTitle = $("chromeQuestionCardTitle");
const chromeReplyTitle = $("chromeReplyTitle");
const chromeQueueTitle = $("chromeQueueTitle");
const chromeTokenCardTitle = $("chromeTokenCardTitle");
const chromeTokenHint = $("chromeTokenHint");
const chromeTokenTotalLabel = $("chromeTokenTotalLabel");
const chromeTokenLastLabel = $("chromeTokenLastLabel");
const chromeComposerLabel = $("chromeComposerLabel");
const chromeComposerHint = $("chromeComposerHint");
const chromeBtnImageLabel = $("chromeBtnImageLabel");
const chromeBtnFileLabel = $("chromeBtnFileLabel");
const chromeComposerAttachHint = $("chromeComposerAttachHint");
const chromeSendLabel = $("chromeSendLabel");
const chromeLangLabel = $("chromeLangLabel");

/** 主區「內容／Token（約略）」分頁切換，並寫入 sessionStorage 供下次開啟還原。 */
function setMainTab(which: "main" | "token"): void {
	const isMain = which === "main";
	panelMain.classList.toggle("hidden", !isMain);
	panelToken.classList.toggle("hidden", isMain);
	tabMain.setAttribute("aria-selected", String(isMain));
	tabToken.setAttribute("aria-selected", String(!isMain));
	try {
		sessionStorage.setItem(TAB_STORAGE_KEY, which);
	} catch {
		/* 部分環境可能禁用 storage */
	}
}

/** 還原上次選中的主分頁，並綁定「內容／Token」切換。 */
function initMainTabs(): void {
	let initial: "main" | "token" = "main";
	try {
		const s = sessionStorage.getItem(TAB_STORAGE_KEY);
		if (s === "token" || s === "main") initial = s;
	} catch {
		/* ignore */
	}
	setMainTab(initial);
	tabMain.addEventListener("click", () => setMainTab("main"));
	tabToken.addEventListener("click", () => setMainTab("token"));
}

/** 將字串轉為可安全插入 HTML 的文字（防 XSS）。 */
function esc(s: string): string {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function hideQuestionCard(): void {
	questionCard.classList.add("hidden");
	curQuestion = null;
}

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
	const actionsHtml = `<div class="q-actions"><button type="button" class="btn btn-danger btn-sm" id="btnCancelQ">${esc(tr.qCancel)}</button><button type="button" class="btn btn-warn btn-sm" id="btnSubmitQ">${esc(tr.qSubmit)}</button></div>`;
	questionBody.innerHTML = blocks.join("") + actionsHtml;
	questionCard.classList.remove("hidden");

	questionBody.querySelectorAll(".q-opt").forEach((el) => {
		el.addEventListener("click", () => toggleOpt(el as HTMLElement));
	});
	$("btnCancelQ").addEventListener("click", cancelQ);
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
}

/** 使用者取消作答：送空答案讓 MCP 端可結束等待（行為與擴充約定一致）。 */
function cancelQ(): void {
	vscode.postMessage({ type: "cancelQuestion" });
	hideQuestionCard();
}

/**
 * 顯示或隱藏 `check_messages`／`send_progress` 寫入的摘要（`reply.json`）。
 * 無內容時清空 DOM 並移除 `reply-content--md`，避免隱藏後仍殘留 HTML／樣式，下次顯示其他內容時誤用 MD 排版。
 */
function renderReply(content: string | undefined): void {
	if (!content) {
		replyCard.classList.add("hidden");
		replyContent.innerHTML = "";
		replyContent.classList.remove("reply-content--md");
		return;
	}
	replyContent.classList.add("reply-content--md");
	replyContent.innerHTML = markdownToSafeHtml(content);
	replyCard.classList.remove("hidden");
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
		if (tp === "text") {
			preview = (it.content ?? "").slice(0, 80);
		} else if (tp === "image") {
			const cap = String(it.caption ?? "").trim();
			preview = cap
				? `${tr.previewImage} · ${cap.slice(0, 60)}`
				: tr.previewImage;
		} else {
			preview = `${tr.previewFilePrefix} ${String(it.path ?? "").split(/[/\\]/).pop() ?? ""}`;
		}
		return `<div class="qp" role="group"><span class="qp-text">${esc(preview)}</span><button type="button" class="qp-remove" data-index="${i}" title="${esc(tr.removeQueueTitle)}" aria-label="${esc(tr.removeQueueAria)}">${esc(tr.removeQueue)}</button></div>`;
	});
	queuePreview.innerHTML = html.join("");
}

/** 顯示側欄送入佇列之 token 約略累計（由擴充估算，非 Cursor 帳單實值）。 */
function renderTokenStats(ts: PanelTokenStats | undefined): void {
	if (!ts || typeof ts.totalEstimated !== "number") {
		tokenTotal.textContent = EMPTY_MARK;
		tokenLast.textContent = EMPTY_MARK;
		return;
	}
	tokenTotal.textContent = String(ts.totalEstimated);
	tokenLast.textContent =
		typeof ts.lastMessageEstimated === "number"
			? String(ts.lastMessageEstimated)
			: EMPTY_MARK;
}

/**
 * 接收 extension host 送來的訊息（`webview.postMessage`）。
 * `type === "state"` 時為完整狀態同步，對應擴充端 `pushStateToPanel`。
 */
window.addEventListener("message", (ev) => {
	const raw = ev.data as { type?: string };
	if (raw.type !== "state") return;
	const m = raw as ExtensionPanelStateMessage;
	lastQueue = m.queue;
	lastUiLanguageSetting = m.uiLanguageSetting;
	applyChrome(m.uiLocale);
	renderQuestion((m.question as QuestionPayload | null) ?? null);
	renderReply(m.reply?.content);
	renderQueuePreview(m.queue);
	renderTokenStats(m.tokenStats);
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
	if (pendingPastes.length === 0 && !text) return;
	if (pendingPastes.length > 0) {
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
		vscode.postMessage({ type: "sendText", text });
	}
	msgInput.value = "";
	updateSend();
}

sendBtn.addEventListener("click", doSend);

/** 由擴充開啟系統檔案選擇器，將本機路徑以 `image`／`file` 類型加入佇列。 */
$("btnPickImage").addEventListener("click", () => {
	vscode.postMessage({ type: "pickQueueFiles", kind: "image" });
});
$("btnPickFile").addEventListener("click", () => {
	vscode.postMessage({ type: "pickQueueFiles", kind: "file" });
});

replyAck.addEventListener("click", () => {
	vscode.postMessage({ type: "ackReply" });
	replyCard.classList.add("hidden");
});

btnResetTokens.addEventListener("click", () => {
	vscode.postMessage({ type: "resetTokenStats" });
});

/** 佇列預覽列：事件委派至 `.qp-remove`，避免每次重繪佇列時重綁多顆按鈕。 */
queuePreview.addEventListener("click", (e) => {
	const t = e.target as HTMLElement | null;
	const btn = t?.closest?.(".qp-remove") as HTMLElement | null;
	if (!btn) return;
	e.preventDefault();
	const idx = Number(btn.getAttribute("data-index"));
	if (!Number.isInteger(idx) || idx < 0) return;
	vscode.postMessage({ type: "removeQueueItem", index: idx });
});

initMainTabs();

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

applyChrome(uiLocale);

/** Webview 載入完成後通知擴充，觸發首次 `pushState`。 */
vscode.postMessage({ type: "ready" });
