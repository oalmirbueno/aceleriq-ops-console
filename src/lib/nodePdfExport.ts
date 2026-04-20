/**
 * nodePdfExport
 *
 * Gera um PDF formatado a partir do `NodePrefillPayload` de um node especializado.
 * Renderiza:
 *  - Cabeçalho colorido com tipo do node + título + cliente + timestamp
 *  - Resumo do método (checklist com done/pending)
 *  - Cada section com seus fields (text, textarea, list, kv, checklist)
 *  - Badge de origem por field (auto/client/edited/empty)
 *  - Footer com paginação
 *
 * Visualmente alinhado com o `briefingExport.ts` (mesma família de tipografia,
 * verde primary, hierarquia clara).
 */
import jsPDF from "jspdf";
import type { NodeBlueprint } from "@/components/workspace/nodeBlueprints";
import type {
  NodePrefillPayload,
  PrefillFieldValue,
  FieldOrigin,
} from "@/components/workspace/nodePrefillTypes";

const ORIGIN_LABEL: Record<FieldOrigin, string> = {
  auto: "auto-IA",
  client: "cliente",
  edited: "editado",
  empty: "—",
  fallback: "vazio",
};

const ORIGIN_COLOR: Record<FieldOrigin, [number, number, number]> = {
  auto: [120, 120, 200],
  client: [40, 160, 90],
  edited: [200, 130, 30],
  empty: [160, 160, 160],
  fallback: [180, 80, 80],
};

function fieldValueToText(field: PrefillFieldValue, type: string): string[] {
  const v = field.value;
  if (type === "list" && Array.isArray(v)) {
    return (v as string[]).filter(Boolean).map((s) => `• ${s}`);
  }
  if (type === "checklist" && Array.isArray(v)) {
    return (v as Array<{ text: string; done: boolean }>).map((it) =>
      `${it.done ? "✓" : "☐"} ${it.text}`,
    );
  }
  if (type === "kv" && v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, string>).map(([k, val]) => `${k}: ${val}`);
  }
  if (typeof v === "string") return v ? [v] : [];
  return [];
}

interface ExportArgs {
  blueprint: NodeBlueprint;
  prefill: NodePrefillPayload | null;
  nodeTitle: string;
  clientName?: string;
  typeLabel?: string;
  /** Cor primária do tipo no header. Default verde Aceleriq. */
  accent?: [number, number, number];
}

export function exportNodePdf({
  blueprint, prefill, nodeTitle, clientName, typeLabel, accent = [20, 184, 90],
}: ExportArgs): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };

  const writeWrapped = (
    text: string, fontSize: number,
    lineHeight = 1.35, color: [number, number, number] = [40, 40, 40],
    style: "normal" | "italic" = "normal",
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text || "—", maxWidth);
    for (const line of lines) {
      ensureSpace(fontSize * lineHeight);
      doc.text(line, margin, y);
      y += fontSize * lineHeight;
    }
  };

  // ── Header colorido
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(nodeTitle, margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta = [typeLabel, clientName].filter(Boolean).join(" · ");
  if (meta) doc.text(meta, margin, 56);
  const stamp = prefill?.generated_at
    ? `${new Date(prefill.generated_at).toLocaleString("pt-BR")} · ${prefill.ai_model}`
    : `Gerado em ${new Date().toLocaleString("pt-BR")}`;
  const stampW = doc.getTextWidth(stamp);
  doc.text(stamp, pageW - margin - stampW, 70);
  y = 110;

  // ── Propósito do blueprint
  if (blueprint.purpose) {
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    const purposeLines = doc.splitTextToSize(blueprint.purpose, maxWidth - 16);
    const boxH = 16 + purposeLines.length * 12 + 8;
    doc.roundedRect(margin, y, maxWidth, boxH, 4, 4, "FD");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    let py = y + 16;
    purposeLines.forEach((l: string) => { doc.text(l, margin + 8, py); py += 12; });
    y += boxH + 12;
  }

  // ── Checklist do método
  if (blueprint.methodChecklist.length > 0) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...accent);
    doc.text("Método ACELERA", margin, y);
    y += 16;
    const state = prefill?.method_state ?? {};
    blueprint.methodChecklist.forEach((item) => {
      const done = !!state[item.id]?.done;
      ensureSpace(14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(done ? 30 : 100, done ? 130 : 100, done ? 60 : 100);
      const prefix = done ? "✓ " : "☐ ";
      const req = item.required ? " *" : "";
      doc.text(`${prefix}${item.label}${req}`, margin + 4, y);
      y += 13;
    });
    y += 10;
  }

  // ── Sections
  blueprint.sections.forEach((section, i) => {
    const content = prefill?.sections?.[section.id];
    ensureSpace(36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...accent);
    doc.text(`${i + 1}. ${section.title}`, margin, y);
    y += 16;

    if (section.description) {
      writeWrapped(section.description, 9, 1.3, [120, 120, 120], "italic");
      y += 4;
    }

    section.fields.forEach((field) => {
      const fv = content?.fields?.[field.id];
      ensureSpace(28);

      // Label do field
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(field.label, margin, y);

      // Badge de origem (à direita)
      if (fv?.origin) {
        const label = ORIGIN_LABEL[fv.origin];
        const color = ORIGIN_COLOR[fv.origin];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...color);
        const badgeW = doc.getTextWidth(label);
        doc.text(label, pageW - margin - badgeW, y);
      }
      y += 13;

      // Valor
      if (!fv || (typeof fv.value === "string" && !fv.value.trim())) {
        writeWrapped("—", 9, 1.3, [180, 180, 180], "italic");
      } else {
        const lines = fieldValueToText(fv, field.type);
        if (lines.length === 0) {
          writeWrapped("—", 9, 1.3, [180, 180, 180], "italic");
        } else {
          lines.forEach((line) => writeWrapped(line, 10, 1.35, [55, 55, 55]));
        }
      }

      // Citation
      if (fv?.citation) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        ensureSpace(11);
        doc.text(`fonte: ${fv.citation}`, margin, y);
        y += 11;
      }
      y += 6;
    });

    if (content?.ai_notes) {
      ensureSpace(20);
      doc.setFillColor(250, 248, 230);
      doc.setDrawColor(230, 220, 160);
      const notesLines = doc.splitTextToSize(`Notas IA: ${content.ai_notes}`, maxWidth - 16);
      const boxH = 12 + notesLines.length * 11 + 8;
      doc.roundedRect(margin, y, maxWidth, boxH, 3, 3, "FD");
      doc.setTextColor(120, 100, 30);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      let ny = y + 13;
      notesLines.forEach((l: string) => { doc.text(l, margin + 8, ny); ny += 11; });
      y += boxH + 6;
    }

    y += 6;
  });

  // ── Footer com paginação
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    const txt = `Aceleriq Ops · ${p}/${total}`;
    doc.text(txt, pageW - margin - doc.getTextWidth(txt), pageH - 20);
  }

  const safeName = nodeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`${safeName || "node"}.pdf`);
}
