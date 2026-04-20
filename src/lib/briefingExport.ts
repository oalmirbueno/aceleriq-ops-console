/**
 * Helpers to export a consolidated briefing in 4 formats:
 * - PDF (jspdf, with cabeçalho do cliente, seções, badges de origem)
 * - Markdown (.md)
 * - JSON (raw structured payload)
 * - Text puro (.txt)
 */
import jsPDF from "jspdf";

export interface BriefingAnswer {
  question: string;
  answer: string;
  source: "client" | "ai_inferred" | "to_define" | "data";
  confidence: "high" | "medium" | "low";
  citation?: string;
}

export interface BriefingSection {
  title: string;
  description: string;
  answers: BriefingAnswer[];
}

export interface ConsolidatedBriefing {
  client_summary: string;
  generated_at: string;
  ai_model: string;
  sections: BriefingSection[];
  next_actions: string[];
}

const SOURCE_LABEL: Record<BriefingAnswer["source"], string> = {
  client: "Cliente",
  ai_inferred: "Inferido pela IA",
  to_define: "A definir",
  data: "Dados do sistema",
};

function safeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportBriefingMarkdown(
  briefing: ConsolidatedBriefing,
  clientName: string,
) {
  const lines: string[] = [];
  lines.push(`# Briefing consolidado — ${clientName}`);
  lines.push("");
  lines.push(`> ${briefing.client_summary}`);
  lines.push("");
  lines.push(
    `*Gerado em ${new Date(briefing.generated_at).toLocaleString("pt-BR")} · Modelo: \`${briefing.ai_model}\`*`,
  );
  lines.push("");

  briefing.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`);
    if (s.description) lines.push(`_${s.description}_`);
    lines.push("");
    s.answers.forEach((a) => {
      lines.push(`**${a.question}**`);
      lines.push("");
      lines.push(a.answer);
      const meta: string[] = [`origem: ${SOURCE_LABEL[a.source]}`];
      if (a.confidence) meta.push(`confiança: ${a.confidence}`);
      if (a.citation) meta.push(`ref: ${a.citation}`);
      lines.push("");
      lines.push(`<sub>${meta.join(" · ")}</sub>`);
      lines.push("");
    });
  });

  if (briefing.next_actions?.length) {
    lines.push(`## Próximas ações`);
    briefing.next_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `briefing-${safeFile(clientName)}.md`);
}

export function exportBriefingJson(
  briefing: ConsolidatedBriefing,
  clientName: string,
) {
  const blob = new Blob([JSON.stringify(briefing, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(blob, `briefing-${safeFile(clientName)}.json`);
}

export function exportBriefingTxt(
  briefing: ConsolidatedBriefing,
  clientName: string,
) {
  const lines: string[] = [];
  lines.push(`BRIEFING CONSOLIDADO — ${clientName}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(briefing.client_summary);
  lines.push("");
  lines.push(
    `Gerado em ${new Date(briefing.generated_at).toLocaleString("pt-BR")} · Modelo ${briefing.ai_model}`,
  );
  lines.push("");

  briefing.sections.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title.toUpperCase()}`);
    lines.push("-".repeat(60));
    if (s.description) lines.push(s.description);
    lines.push("");
    s.answers.forEach((a) => {
      lines.push(`Q: ${a.question}`);
      lines.push(`R: ${a.answer}`);
      lines.push(`   [${SOURCE_LABEL[a.source]} · ${a.confidence}${a.citation ? ` · ${a.citation}` : ""}]`);
      lines.push("");
    });
  });

  if (briefing.next_actions?.length) {
    lines.push("PRÓXIMAS AÇÕES");
    lines.push("-".repeat(60));
    briefing.next_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `briefing-${safeFile(clientName)}.txt`);
}

export function exportBriefingPdf(
  briefing: ConsolidatedBriefing,
  clientName: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text: string, fontSize: number, lineHeight = 1.35, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text || "—", maxWidth);
    for (const line of lines) {
      ensureSpace(fontSize * lineHeight);
      doc.text(line, margin, y);
      y += fontSize * lineHeight;
    }
  };

  // ── Header
  doc.setFillColor(20, 184, 90); // primary green-ish
  doc.rect(0, 0, pageW, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Briefing Consolidado", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(clientName, margin, 58);
  const stamp = `${new Date(briefing.generated_at).toLocaleString("pt-BR")} · ${briefing.ai_model}`;
  const stampW = doc.getTextWidth(stamp);
  doc.text(stamp, pageW - margin - stampW, 58);
  y = 110;

  // Summary box
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, maxWidth, 60, 4, 4, "FD");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const summaryLines = doc.splitTextToSize(briefing.client_summary || "—", maxWidth - 16);
  let sy = y + 16;
  summaryLines.slice(0, 3).forEach((l: string) => {
    doc.text(l, margin + 8, sy);
    sy += 14;
  });
  y += 80;

  // Sections
  briefing.sections.forEach((s, i) => {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 130, 70);
    doc.text(`${i + 1}. ${s.title}`, margin, y);
    y += 18;

    if (s.description) {
      writeWrapped(s.description, 9, 1.3, [120, 120, 120]);
      y += 4;
    }

    s.answers.forEach((a) => {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const qLines = doc.splitTextToSize(a.question, maxWidth);
      qLines.forEach((l: string) => {
        ensureSpace(13);
        doc.text(l, margin, y);
        y += 13;
      });

      writeWrapped(a.answer, 10, 1.4, [50, 50, 50]);

      const meta = `${SOURCE_LABEL[a.source]} · ${a.confidence}${a.citation ? ` · ${a.citation}` : ""}`;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      ensureSpace(12);
      doc.text(meta, margin, y);
      y += 16;
    });
    y += 8;
  });

  if (briefing.next_actions?.length) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 130, 70);
    doc.text("Próximas ações", margin, y);
    y += 18;
    briefing.next_actions.forEach((a, i) => {
      writeWrapped(`${i + 1}. ${a}`, 10, 1.4, [50, 50, 50]);
    });
  }

  // Footer page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    const txt = `Aceleriq Ops · ${p}/${total}`;
    const tw = doc.getTextWidth(txt);
    doc.text(txt, pageW - margin - tw, pageH - 20);
  }

  doc.save(`briefing-${safeFile(clientName)}.pdf`);
}
