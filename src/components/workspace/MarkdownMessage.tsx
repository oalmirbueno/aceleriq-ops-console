/**
 * MarkdownMessage — renderizador leve de markdown sem dependências externas.
 *
 * Suporta: headings, bold, italic, inline code, code blocks, listas, links,
 * quebras de linha. Suficiente para mensagens do chat IA.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  className?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-foreground/90 text-[0.85em] font-mono">$1</code>');
  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // italic
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:opacity-80">$1</a>',
  );
  return html;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listType) return;
    const tag = listType;
    const cls = tag === "ul" ? "list-disc" : "list-decimal";
    out.push(`<${tag} class="${cls} pl-5 my-2 space-y-1">${listBuf.join("")}</${tag}>`);
    listBuf = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw;

    // code fence
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(
          `<pre class="my-2 rounded-md bg-muted/60 border border-border p-3 overflow-x-auto"><code class="text-xs font-mono text-foreground/90">${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const sizes = ["text-base font-semibold", "text-sm font-semibold", "text-sm font-medium"];
      out.push(`<div class="${sizes[level - 1]} mt-2 mb-1">${renderInline(h[2])}</div>`);
      continue;
    }

    // ordered list
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuf.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    // unordered list
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuf.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    // empty line = paragraph break
    if (!line.trim()) {
      flushList();
      out.push("");
      continue;
    }

    flushList();
    out.push(`<p class="my-1 leading-relaxed">${renderInline(line)}</p>`);
  }

  // flush leftovers
  if (inCode && codeBuf.length) {
    out.push(
      `<pre class="my-2 rounded-md bg-muted/60 border border-border p-3 overflow-x-auto"><code class="text-xs font-mono text-foreground/90">${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
    );
  }
  flushList();

  return out.join("");
}

export default function MarkdownMessage({ content, className }: Props) {
  const html = useMemo(() => renderMarkdown(content ?? ""), [content]);
  return (
    <div
      className={cn("text-sm text-foreground/90", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}