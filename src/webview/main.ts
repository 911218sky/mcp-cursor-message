/**
 * 側欄 Webview 腳本（打包為 dist/webview.js）。
 * 負責渲染佇列／問答／摘要，並以 `postMessage` 與 extension host 通訊。
 */
declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

type QuestionOption = { id: string; label: string };
type QuestionItem = {
	id: string;
	question: string;
	options: QuestionOption[];
	allow_multiple: boolean;
};
type QuestionPayload = {
	id: string;
	questions: QuestionItem[];
	timestamp?: string;
};

const vscode = acquireVsCodeApi();

const TAB_STORAGE_KEY = "mcpMessengerMainTab";

/** 以 id 取得 DOM 節點（不存在時會拋錯，與面板 HTML 約定同步）。 */
const $ = (id: string) => document.getElementById(id)!;

/** 主區「內容／Token（約略）」分頁切換，並寫入 sessionStorage 供下次開啟還原。 */
function setMainTab(which: "main" | "token"): void {
	const main = $("panelMain");
	const tok = $("panelToken");
	const tabMain = $("tabMain");
	const tabToken = $("tabToken");
	const isMain = which === "main";
	main.classList.toggle("hidden", !isMain);
	tok.classList.toggle("hidden", isMain);
	tabMain.setAttribute("aria-selected", String(isMain));
	tabToken.setAttribute("aria-selected", String(!isMain));
	try {
		sessionStorage.setItem(TAB_STORAGE_KEY, which);
	} catch {
		/* 部分環境可能禁用 storage */
	}
}

function initMainTabs(): void {
	let initial: "main" | "token" = "main";
	try {
		const s = sessionStorage.getItem(TAB_STORAGE_KEY);
		if (s === "token" || s === "main") initial = s;
	} catch {
		/* ignore */
	}
	setMainTab(initial);
	$("tabMain").addEventListener("click", () => setMainTab("main"));
	$("tabToken").addEventListener("click", () => setMainTab("token"));
}

/** 將字串轉為可安全插入 HTML 的文字（防 XSS）。 */
function esc(s: string): string {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

let curQuestion: QuestionPayload | null = null;
const selectedAnswers: Record<string, string[]> = {};

/**
 * 依 MCP 寫入的 `question.json` 渲染問答卡；無題目時隱藏區塊。
 * 會重綁選項點擊與提交／取消按鈕。
 */
function renderQuestion(q: QuestionPayload | null): void {
	const card = $("questionCard");
	const body = $("questionBody");
	if (
		!q ||
		!Array.isArray(q.questions) ||
		q.questions.length === 0
	) {
		card.classList.add("hidden");
		curQuestion = null;
		return;
	}
	curQuestion = q;
	Object.keys(selectedAnswers).forEach((k) => delete selectedAnswers[k]);
	let h = "";
	for (const qi of q.questions) {
		selectedAnswers[qi.id] = [];
		h += `<div class="q-block" data-qid="${esc(qi.id)}">`;
		h += `<div class="q-text">${esc(qi.question)}</div>`;
		h += `<div class="q-options">`;
		for (const opt of qi.options) {
			const multi = qi.allow_multiple ? " multi" : "";
			h += `<div class="q-opt${multi}" data-qid="${esc(qi.id)}" data-oid="${esc(opt.id)}">`;
			h += `<span class="check"></span><span>${esc(opt.label)}</span></div>`;
		}
		h += `</div>`;
		h += `<input class="q-other" data-qid="${esc(qi.id)}" placeholder="補充說明（可選）">`;
		h += `</div>`;
	}
	h +=
		'<div class="q-actions"><button type="button" class="btn btn-danger btn-sm" id="btnCancelQ">取消</button><button type="button" class="btn btn-warn btn-sm" id="btnSubmitQ">提交回答</button></div>';
	body.innerHTML = h;
	card.classList.remove("hidden");

	body.querySelectorAll(".q-opt").forEach((el) => {
		el.addEventListener("click", () => toggleOpt(el as HTMLElement));
	});
	$("btnCancelQ").addEventListener("click", cancelQ);
	$("btnSubmitQ").addEventListener("click", submitQ);
	card.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
	const answers: { questionId: string; selected: string[]; other: string }[] = [];
	for (const qi of curQuestion.questions) {
		const otherInput = document.querySelector(
			`.q-other[data-qid="${qi.id}"]`
		) as HTMLInputElement | null;
		answers.push({
			questionId: qi.id,
			selected: selectedAnswers[qi.id] ?? [],
			other: otherInput?.value.trim() ?? "",
		});
	}
	vscode.postMessage({ type: "submitAnswer", answers });
	$("questionCard").classList.add("hidden");
	curQuestion = null;
}

/** 使用者取消作答：送空答案讓 MCP 端可結束等待（行為與擴充約定一致）。 */
function cancelQ(): void {
	vscode.postMessage({ type: "cancelQuestion" });
	$("questionCard").classList.add("hidden");
	curQuestion = null;
}

/** 顯示或隱藏 `check_messages`／`send_progress` 寫入的摘要（`reply.json`）。 */
function renderReply(content: string | undefined): void {
	const card = $("replyCard");
	const rc = $("replyContent");
	if (!content) {
		card.classList.add("hidden");
		return;
	}
	rc.textContent = content;
	card.classList.remove("hidden");
}

/** 將佇列預覽為簡短列表（文字截斷、圖片／檔案標籤）。 */
function renderQueuePreview(queue: unknown): void {
	const el = $("queuePreview");
	if (!Array.isArray(queue) || queue.length === 0) {
		el.innerHTML = '<p class="muted">佇列為空</p>';
		return;
	}
	let h = "";
	for (const it of queue as { type?: string; content?: string; path?: string }[]) {
		const tp = it.type ?? "text";
		const preview =
			tp === "text"
				? (it.content ?? "").slice(0, 80)
				: tp === "image"
					? "[圖片]"
					: "[檔案] " + String(it.path ?? "").split(/[/\\]/).pop();
		h += `<div class="qp">${esc(preview)}</div>`;
	}
	el.innerHTML = h;
}

type TokenStats = {
	totalEstimated?: number;
	lastMessageEstimated?: number;
	updatedAt?: string;
};

/** 顯示側欄送入佇列之 token 約略累計（由擴充估算，非 Cursor 帳單實值）。 */
function renderTokenStats(ts: TokenStats | undefined): void {
	const totalEl = $("tokenTotal");
	const lastEl = $("tokenLast");
	if (!ts || typeof ts.totalEstimated !== "number") {
		totalEl.textContent = "—";
		lastEl.textContent = "—";
		return;
	}
	totalEl.textContent = String(ts.totalEstimated);
	lastEl.textContent =
		typeof ts.lastMessageEstimated === "number"
			? String(ts.lastMessageEstimated)
			: "—";
}

window.addEventListener("message", (ev) => {
	const m = ev.data as {
		type?: string;
		question?: unknown;
		reply?: { content?: string } | null;
		queue?: unknown;
		tokenStats?: TokenStats;
	};
	if (m.type === "state") {
		renderQuestion((m.question as QuestionPayload | null) ?? null);
		renderReply(m.reply?.content);
		renderQueuePreview(m.queue);
		renderTokenStats(m.tokenStats);
	}
});

const ta = $("msgInput") as HTMLTextAreaElement;
const sendBtn = $("sendBtn") as HTMLButtonElement;

/** 依輸入是否為空，啟用或停用「送出」按鈕。 */
function updateSend(): void {
	sendBtn.disabled = !ta.value.trim();
}

ta.addEventListener("input", updateSend);
/** 輸入框內 Ctrl+V 貼上剪貼簿圖片時寫入佇列（與「圖片」按鈕同效）。 */
ta.addEventListener("paste", (e: ClipboardEvent) => {
	const items = e.clipboardData?.items;
	if (!items?.length) return;
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it.type.startsWith("image/")) continue;
		e.preventDefault();
		const file = it.getAsFile();
		if (!file) continue;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const comma = dataUrl.indexOf(",");
			const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
			if (!b64) return;
			vscode.postMessage({
				type: "pasteImage",
				base64: b64,
				mime: file.type || "image/png",
			});
		};
		reader.readAsDataURL(file);
		return;
	}
});
ta.addEventListener("keydown", (e) => {
	if (e.key !== "Enter") return;
	if (e.shiftKey) return;
	e.preventDefault();
	doSend();
});

/** 讀取輸入框並 `sendText` 至擴充，成功後清空輸入。 */
function doSend(): void {
	const text = ta.value.trim();
	if (!text) return;
	vscode.postMessage({ type: "sendText", text });
	ta.value = "";
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

$("replyAck").addEventListener("click", () => {
	vscode.postMessage({ type: "ackReply" });
	$("replyCard").classList.add("hidden");
});

$("btnResetTokens").addEventListener("click", () => {
	vscode.postMessage({ type: "resetTokenStats" });
});

initMainTabs();

/** Webview 載入完成後通知擴充，觸發首次 `pushState`。 */
vscode.postMessage({ type: "ready" });
