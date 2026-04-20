/**
 * SiteNodeDrawer
 *
 * Wrapper especializado pra nodes "site". Usa o SpecializedNodeDrawer
 * com blueprint SITE + um extraSlot que mostra:
 *  - Botão "Abrir no SiteBolt" (link externo se tiver URL definido)
 *  - Preview compacto do hero (headline + subheadline + CTA) lido do prefill
 *  - Preview do SEO (meta title + description com contadores)
 *
 * Lê o prefill direto de node.metadata.prefill — sem chamar o hook de novo.
 */
import { useMemo } from "react";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import { getNodeBlueprint } from "./nodeBlueprints";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Globe, Sparkles, Search } from "lucide-react";
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
  onGoLive?: () => void;
}

const SITEBOLT_BASE = "https://sitebolt.aceleriq.com"; // ajuste se mudar

function getStringField(payload: NodePrefillPayload | null, sectionId: string, fieldId: string): string {
  const f = payload?.sections?.[sectionId]?.fields?.[fieldId];
  if (!f) return "";
  return typeof f.value === "string" ? f.value : "";
}

export default function SiteNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete, onGoLive,
}: Props) {
  const blueprint = getNodeBlueprint("site");
  const { prefill } = useCanvasNodeMetadata({ nodeId: node.id, open });
  const { handlers: baseHandlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName,
  });

  // URL do site — primeiro tenta o campo "domain" da seção launch, depois data.url
  const siteUrl = useMemo(() => {
    const domain = getStringField(prefill, "launch", "domain").trim();
    if (domain) return domain.startsWith("http") ? domain : `https://${domain}`;
    const data = node.data as Record<string, unknown> | null;
    const dataUrl = (data?.url ?? data?.external_url ?? data?.website) as string | undefined;
    return typeof dataUrl === "string" && dataUrl.trim() ? dataUrl.trim() : null;
  }, [prefill, node.data]);

  const sitebotEditUrl = `${SITEBOLT_BASE}/edit?node=${encodeURIComponent(node.id)}&workspace=${encodeURIComponent(workspaceId)}`;

  // Preview hero
  const heroHeadline    = getStringField(prefill, "copy", "hero_headline");
  const heroSubheadline = getStringField(prefill, "copy", "hero_subheadline");
  const heroCta         = getStringField(prefill, "copy", "hero_cta");

  // Preview SEO
  const metaTitle       = getStringField(prefill, "seo", "meta_title");
  const metaDescription = getStringField(prefill, "seo", "meta_description");

  if (!blueprint) return null;

  const handlers = {
    ...baseHandlers,
    ...(onGoLive && { go_live: onGoLive }),
  };

  const extraSlot = (
    <div className="space-y-3">
      {/* ─── Bloco SiteBolt ─── */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-muted/10 border border-border flex items-center justify-center shrink-0">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">SiteBolt — Editor visual</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {siteUrl ?? "Domínio ainda não definido"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {siteUrl && (
              <Button asChild size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" /> Ver site
                </a>
              </Button>
            )}
            <Button asChild size="sm" className="h-7 text-[11px] gap-1">
              <a href={sitebotEditUrl} target="_blank" rel="noopener noreferrer">
                <Sparkles className="h-3 w-3" /> Abrir SiteBolt
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Preview Hero ─── */}
      {(heroHeadline || heroSubheadline || heroCta) && (
        <div className="rounded-lg border border-border bg-gradient-to-br from-card to-muted/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-[9px]">PREVIEW HERO</Badge>
            <span className="text-[10px] text-muted-foreground">Como o visitante verá ao chegar</span>
          </div>
          {heroHeadline && (
            <h3 className="text-base font-bold leading-tight text-foreground">{heroHeadline}</h3>
          )}
          {heroSubheadline && (
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{heroSubheadline}</p>
          )}
          {heroCta && (
            <Button size="sm" className="mt-3 h-7 text-[11px]" disabled>
              {heroCta}
            </Button>
          )}
        </div>
      )}

      {/* ─── Preview SEO (snippet Google) ─── */}
      {(metaTitle || metaDescription) && (
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <Badge variant="outline" className="text-[9px]">SNIPPET GOOGLE</Badge>
          </div>
          <div className="space-y-0.5 max-w-md">
            {siteUrl && (
              <p className="text-[10px] text-muted-foreground truncate">{siteUrl.replace(/^https?:\/\//, "")}</p>
            )}
            {metaTitle && (
              <p className="text-sm text-muted-foreground leading-tight line-clamp-1">{metaTitle}</p>
            )}
            {metaDescription && (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{metaDescription}</p>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[9px] text-muted-foreground">
            <span className={metaTitle.length > 60 ? "text-muted-foreground" : ""}>
              title: {metaTitle.length}/60
            </span>
            <span>·</span>
            <span className={metaDescription.length > 160 ? "text-muted-foreground" : ""}>
              desc: {metaDescription.length}/160
            </span>
          </div>
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
