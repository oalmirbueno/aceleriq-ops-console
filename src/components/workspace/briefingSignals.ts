/**
 * Briefing Structured Signals — deterministic local parser.
 *
 * Extracts structured signals from briefing text using keyword/heading matching.
 * No AI dependency. All rules are explicit and auditable.
 *
 * Signal blocks stored in metadata.structured_signals on the briefing master document.
 */

/* ─── Signal block keys (padronized) ─── */

export const SIGNAL_BLOCK_KEYS = [
  "identity",
  "offer",
  "icp_persona",
  "pain_points",
  "goals",
  "accesses",
  "diagnosis",
  "decisions",
  "gaps",
  "priorities",
] as const;

export type SignalBlockKey = (typeof SIGNAL_BLOCK_KEYS)[number];

export interface SignalEntry {
  summary: string;
  /** Which dossier block this feeds */
  dossier_block: string;
}

export type StructuredSignals = Partial<Record<SignalBlockKey, SignalEntry>>;

/** Full metadata shape for signals on a briefing master */
export interface BriefingSignalsMetadata {
  structured_signals: StructuredSignals;
  dossier_signals: string[];     // list of dossier_block keys fed
  task_signals: string[];        // list of signal keys relevant for task gen
  documentation_signals: string[]; // list of signal keys relevant for docs
}

/* ─── Labels ─── */

export const SIGNAL_LABELS: Record<SignalBlockKey, string> = {
  identity: "Identidade e Posicionamento",
  offer: "Oferta e Serviços",
  icp_persona: "ICP e Persona",
  pain_points: "Dores e Problemas",
  goals: "Objetivos e Metas",
  accesses: "Acessos e Ferramentas",
  diagnosis: "Diagnóstico",
  decisions: "Decisões",
  gaps: "Lacunas",
  priorities: "Prioridades",
};

/* ─── Signal → Dossier block mapping ─── */

export const SIGNAL_TO_DOSSIER: Record<SignalBlockKey, string> = {
  identity: "identity",
  offer: "offer",
  icp_persona: "offer",
  pain_points: "diagnostic",
  goals: "offer",
  accesses: "access",
  diagnosis: "diagnostic",
  decisions: "decisions",
  gaps: "decisions",
  priorities: "decisions",
};

/* ─── Signal → Task relevance ─── */

const TASK_RELEVANT_SIGNALS: SignalBlockKey[] = [
  "pain_points", "goals", "accesses", "diagnosis", "decisions", "gaps", "priorities",
];

const DOC_RELEVANT_SIGNALS: SignalBlockKey[] = [
  "identity", "offer", "icp_persona", "goals", "accesses",
];

/* ─── Heading/keyword patterns per signal block ─── */

interface PatternDef {
  key: SignalBlockKey;
  patterns: RegExp[];
}

const SIGNAL_PATTERNS: PatternDef[] = [
  {
    key: "identity",
    patterns: [
      /identidade/i, /posicionamento/i, /marca/i, /branding/i,
      /quem\s+(é|somos)/i, /sobre\s+(a\s+)?empresa/i, /história/i,
      /missão/i, /visão/i, /valores/i, /propósito/i,
    ],
  },
  {
    key: "offer",
    patterns: [
      /oferta/i, /serviço/i, /produto/i, /solução/i, /portf[oó]lio/i,
      /o\s+que\s+(vende|oferece|entrega)/i, /proposta\s+de\s+valor/i,
    ],
  },
  {
    key: "icp_persona",
    patterns: [
      /icp/i, /persona/i, /p[úu]blico/i, /cliente\s+ideal/i,
      /avatar/i, /segmento/i, /nicho/i, /audiência/i,
    ],
  },
  {
    key: "pain_points",
    patterns: [
      /dor(es)?/i, /problema/i, /desafio/i, /dificuldade/i,
      /obstáculo/i, /frustração/i, /queixa/i,
    ],
  },
  {
    key: "goals",
    patterns: [
      /objetivo/i, /meta/i, /resultado/i, /expectativa/i,
      /onde\s+quer\s+chegar/i, /ambição/i, /aspiração/i,
    ],
  },
  {
    key: "accesses",
    patterns: [
      /acesso/i, /login/i, /senha/i, /credencial/i,
      /ferramenta/i, /plataforma/i, /sistema/i, /domínio/i, /hosting/i,
    ],
  },
  {
    key: "diagnosis",
    patterns: [
      /diagnóstico/i, /análise/i, /avaliação/i, /auditoria/i,
      /situação\s+atual/i, /estado\s+atual/i, /levantamento/i,
    ],
  },
  {
    key: "decisions",
    patterns: [
      /decisão/i, /decisões/i, /definição/i, /definido/i,
      /escolha/i, /aprovação/i, /validação/i,
    ],
  },
  {
    key: "gaps",
    patterns: [
      /lacuna/i, /falta/i, /ausência/i, /pendência/i,
      /faltando/i, /não\s+tem/i, /precisa\s+de/i,
    ],
  },
  {
    key: "priorities",
    patterns: [
      /prioridade/i, /urgência/i, /urgente/i, /primeiro\s+passo/i,
      /imediato/i, /foco/i, /ação\s+prioritária/i,
    ],
  },
];

/* ─── Section splitter ─── */

interface TextSection {
  heading: string;
  body: string;
}

function splitIntoSections(text: string): TextSection[] {
  // Split by lines that look like headings (e.g., "## Heading", "HEADING:", numbered headings)
  const lines = text.split("\n");
  const sections: TextSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  const isHeading = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,4}\s+/.test(trimmed)) return true;
    if (/^\d+[\.\)]\s+[A-ZÁÉÍÓÚÀÃÕÇ]/.test(trimmed)) return true;
    if (/^[A-ZÁÉÍÓÚÀÃÕÇ][A-ZÁÉÍÓÚÀÃÕÇ\s]{3,}:?\s*$/.test(trimmed)) return true;
    if (/^[\*\-]\s*\*\*/.test(trimmed)) return true;
    return false;
  };

  for (const line of lines) {
    if (isHeading(line)) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
      }
      currentHeading = line.trim().replace(/^#+\s*/, "").replace(/^\d+[\.\)]\s*/, "").replace(/:$/, "").trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }

  return sections;
}

/* ─── Main extraction function ─── */

export function extractStructuredSignals(text: string): BriefingSignalsMetadata {
  const sections = splitIntoSections(text);
  const signals: StructuredSignals = {};
  const matchedKeys = new Set<SignalBlockKey>();

  // For each section, find best matching signal block
  for (const section of sections) {
    const combined = `${section.heading} ${section.body.slice(0, 200)}`;
    if (!combined.trim()) continue;

    let bestMatch: SignalBlockKey | null = null;
    let bestScore = 0;

    for (const patDef of SIGNAL_PATTERNS) {
      if (matchedKeys.has(patDef.key)) continue; // one section per signal
      let score = 0;
      for (const pat of patDef.patterns) {
        // Check heading first (higher weight)
        if (pat.test(section.heading)) score += 3;
        if (pat.test(section.body.slice(0, 500))) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = patDef.key;
      }
    }

    if (bestMatch && bestScore >= 2) {
      matchedKeys.add(bestMatch);
      const summary = section.body
        ? section.body.slice(0, 500).trim()
        : section.heading;
      signals[bestMatch] = {
        summary,
        dossier_block: SIGNAL_TO_DOSSIER[bestMatch],
      };
    }
  }

  // If no sections matched (flat text), do a global keyword scan
  if (matchedKeys.size === 0 && text.length > 50) {
    for (const patDef of SIGNAL_PATTERNS) {
      let score = 0;
      for (const pat of patDef.patterns) {
        if (pat.test(text)) score++;
      }
      if (score >= 2) {
        // Extract a snippet around the first match
        const firstPat = patDef.patterns.find((p) => p.test(text));
        const match = firstPat ? text.match(firstPat) : null;
        const idx = match?.index ?? 0;
        const start = Math.max(0, idx - 50);
        const snippet = text.slice(start, start + 400).trim();
        signals[patDef.key] = {
          summary: snippet,
          dossier_block: SIGNAL_TO_DOSSIER[patDef.key],
        };
      }
    }
  }

  const signalKeys = Object.keys(signals) as SignalBlockKey[];

  return {
    structured_signals: signals,
    dossier_signals: [...new Set(signalKeys.map((k) => SIGNAL_TO_DOSSIER[k]))],
    task_signals: signalKeys.filter((k) => TASK_RELEVANT_SIGNALS.includes(k)),
    documentation_signals: signalKeys.filter((k) => DOC_RELEVANT_SIGNALS.includes(k)),
  };
}

/* ─── Helpers for consumers ─── */

export function getReviewedSignals(metadata: Record<string, unknown> | null | undefined): StructuredSignals | null {
  if (!metadata) return null;
  if (metadata.import_review_status !== "reviewed") return null;
  const signals = metadata.structured_signals as StructuredSignals | undefined;
  if (!signals || Object.keys(signals).length === 0) return null;
  return signals;
}

export function getTaskSignalSummaries(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  if (metadata.import_review_status !== "reviewed") return [];
  const signals = metadata.structured_signals as StructuredSignals | undefined;
  const taskKeys = metadata.task_signals as SignalBlockKey[] | undefined;
  if (!signals || !taskKeys) return [];
  return taskKeys
    .map((k) => signals[k]?.summary)
    .filter(Boolean) as string[];
}

export function getDossierSignalsByBlock(
  metadata: Record<string, unknown> | null | undefined
): Map<string, { key: string; label: string; summary: string }[]> {
  const result = new Map<string, { key: string; label: string; summary: string }[]>();
  if (!metadata) return result;
  if (metadata.import_review_status !== "reviewed") return result;
  const signals = metadata.structured_signals as Record<string, { summary: string; dossier_block: string }> | undefined;
  if (!signals) return result;

  for (const [key, entry] of Object.entries(signals)) {
    const block = entry.dossier_block;
    const label = SIGNAL_LABELS[key as SignalBlockKey] ?? key;
    if (!result.has(block)) result.set(block, []);
    result.get(block)!.push({ key, label, summary: entry.summary });
  }

  return result;
}
