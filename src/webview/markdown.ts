/**
 * 將 MCP 摘要等 Markdown 轉為可插入 Webview 的安全 HTML。
 */
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

export function markdownToSafeHtml(md: string): string {
	const html = marked.parse(md, { async: false }) as string;
	return DOMPurify.sanitize(html);
}
