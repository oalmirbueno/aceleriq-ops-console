/**
 * KickoffNodeDrawer
 *
 * Wrapper pra nodes "reuniao" (kickoff). Adiciona:
 *  - Card resumo com data/hora/canal
 *  - Botão "Baixar .ics" que gera convite calendário local (sem edge function)
 *    incluindo título, descrição, agenda e participantes
 *  - Lista compacta dos participantes pré-confirmados
 */
import { useMemo } from "react";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import { getNodeBlueprint } from "./nodeBlueprints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, Video, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCanvasNodeMetadata } from "@/hooks/useCanvasNodeMetadata";
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { NodePrefillPayload } from "./nodePrefillTypes";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onOpenBriefing?: () => void;
}

function getStringField(payload: NodePrefillPayload | null, sectionId: string, fieldId: string): string {
  const f = payload?.sections?.[sectionId]?.fields?.[fieldId];
  return typeof f?.value === "string" ? f.value : "";
}

function getListField(payload: NodePrefillPayload | null, sectionId: string, fieldId: string): string[] {
  const f = payload?.sections?.[sectionId]?.fields?.[fieldId];
  return Array.isArray(f?.value) ? (f.value as string[]).filter((x): x is string => typeof x === "string") : [];
}

/** dd/mm/yyyy [hh:mm] → Date | null  (e tenta ISO também) */
function parseDateTime(raw: string): Date | null {
  if (!raw) return null;
  const iso = new Date(raw);
  if (!isNaN(iso.getTime()) && raw.length > 5) return iso;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\s,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, d, mo, y, hh, mm] = m;
    const yr = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const dt = new Date(yr, parseInt(mo) - 1, parseInt(d), hh ? parseInt(hh) : 9, mm ? parseInt(mm) : 0);
    if (!isNaN(dt.getTime())) return dt;
  }
  return null;
}

/** "60min" / "1h30" → minutos */
function parseDurationMinutes(raw: string, fallback = 60): number {
  if (!raw) return fallback;
  const h = raw.match(/(\d+)\s*h/i);
  const m = raw.match(/(\d+)\s*m/i);
  let total = 0;
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  if (total === 0) {
    const onlyNum = raw.match(/(\d+)/);
    if (onlyNum) total = parseInt(onlyNum[1]);
  }
  return total > 0 ? total : fallback;
}

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function toICSDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildICS(opts: {
  uid: string; title: string; description: string;
  start: Date; end: Date; location?: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aceleriq Ops//Kickoff//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(opts.start)}`,
    `DTEND:${toICSDate(opts.end)}`,
    `SUMMARY:${escapeICS(opts.title)}`,
    `DESCRIPTION:${escapeICS(opts.description)}`,
    opts.location ? `LOCATION:${escapeICS(opts.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export default function KickoffNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete,
  onOpenBriefing,
}: Props) {
  const blueprint = getNodeBlueprint("reuniao");
  const { prefill } = useCanvasNodeMetadata({ nodeId: node.id, open });
  const { handlers: baseHandlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName,
  });

  const dateRaw     = getStringField(prefill, "meta", "date");
  const durationRaw = getStringField(prefill, "meta", "duration");
  const channel     = getStringField(prefill, "meta", "channel");
  const agenda      = getListField(prefill, "agenda", "items");
  const clientTeam  = getListField(prefill, "participants", "client");
  const agencyTeam  = getListField(prefill, "participants", "agency");
  const decisions   = getListField(prefill, "decisions", "expected");

  const startDate = useMemo(() => parseDateTime(dateRaw), [dateRaw]);
  const durationMin = useMemo(() => parseDurationMinutes(durationRaw, 60), [durationRaw]);
  const endDate = useMemo(
    () => startDate ? new Date(startDate.getTime() + durationMin * 60_000) : null,
    [startDate, durationMin],
  );

  const handleDownloadIcs = () => {
    if (!startDate || !endDate) {
      toast({
        title: "Defina a data primeiro",
        description: "Preencha 'Data e horário' na seção Detalhes antes de exportar.",
        variant: "destructive",
      });
      return;
    }
    const description = [
      `Kickoff${clientName ? ` — ${clientName}` : ""}`,
      "",
      agenda.length ? "AGENDA:" : "",
      ...agenda.map((a) => `- ${a}`),
      agenda.length ? "" : "",
      decisions.length ? "DECISÕES ESPERADAS:" : "",
      ...decisions.map((d) => `- ${d}`),
      decisions.length ? "" : "",
      [...clientTeam, ...agencyTeam].length ? "PARTICIPANTES:" : "",
      ...clientTeam.map((p) => `- ${p} (cliente)`),
      ...agencyTeam.map((p) => `- ${p} (interno)`),
    ].filter(Boolean).join("\n");

    const ics = buildICS({
      uid: `${node.id}@aceleriq.ops`,
      title: node.title || "Kickoff",
      description,
      start: startDate,
      end: endDate,
      location: channel || undefined,
    });

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (node.title || "kickoff").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    a.href = url;
    a.download = `${safeName}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Convite .ics baixado", description: "Importe no Google/Outlook/Apple Calendar." });
  };

  if (!blueprint) return null;

  const handlers = {
    ...baseHandlers,
    schedule_meeting: handleDownloadIcs,
    ...(onOpenBriefing && { open_briefing: onOpenBriefing }),
  };

  const fmtFull = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const totalParticipants = clientTeam.length + agencyTeam.length;

  const extraSlot = (
    <div className="space-y-3">
      {/* ─── Card resumo ─── */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-muted/10 border border-border flex items-center justify-center shrink-0">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">
                {startDate ? fmtFull(startDate) : "Data não definida"}
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                {startDate && (
                  <>
                    <Clock className="h-2.5 w-2.5" />
                    <span>{durationMin} min</span>
                    <span>·</span>
                  </>
                )}
                {channel && (
                  <>
                    <Video className="h-2.5 w-2.5" />
                    <span className="truncate">{channel}</span>
                  </>
                )}
                {!channel && !startDate && <span>Preencha 'Detalhes da reunião'</span>}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleDownloadIcs}
            disabled={!startDate}
            className="h-7 text-[11px] gap-1 shrink-0"
          >
            <Download className="h-3 w-3" /> Baixar .ics
          </Button>
        </div>

        {totalParticipants > 0 && (
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                {totalParticipants} participante{totalParticipants === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {clientTeam.map((p, i) => (
                <Badge key={`c${i}`} variant="outline" className="text-[9px] border-border text-muted-foreground">
                  {p}
                </Badge>
              ))}
              {agencyTeam.map((p, i) => (
                <Badge key={`a${i}`} variant="outline" className="text-[9px] border-border text-muted-foreground">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Agenda compacta ─── */}
      {agenda.length > 0 && (
        <div className="rounded-md border border-border bg-card/40 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Badge variant="outline" className="text-[9px]">AGENDA</Badge>
            <span className="text-[10px] text-muted-foreground">{agenda.length} item{agenda.length === 1 ? "" : "s"}</span>
          </div>
          <ol className="space-y-0.5 list-decimal list-inside">
            {agenda.map((item, i) => (
              <li key={i} className="text-[11px] text-foreground leading-snug">{item}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  return (
    <>
      <SpecializedNodeDrawer
        node={node}
        open={open}
        onOpenChange={onOpenChange}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName}
        blueprintOverride={blueprint}
        quickActionHandlers={handlers}
        onDelete={onDelete}
        extraSlot={extraSlot}
      />
      {dialogs}
    </>
  );
}
