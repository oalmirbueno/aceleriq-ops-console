import { useEffect, useState } from "react";
import HeaderV2 from "@/v2/components/HeaderV2";
import { Link } from "react-router-dom";
import {
  Settings, Database, Layers, ShieldCheck, Wrench, RefreshCw, ExternalLink,
  CheckCircle2, AlertTriangle, Lock,
} from "lucide-react";
import {
  PORTAL_MODE,
  clearPortalCache,
  subscribeBridgeError,
  type BridgeErrorState,
  portalClient,
} from "@/v2/data/portalClient";
import { useDevMode } from "@/lib/devMode";
import {
  useV2Setting,
  V2_SETTINGS,
  resetV2Settings,
} from "@/v2/lib/v2Settings";
import { RotateCcw } from "lucide-react";

function Section({
  icon: Icon, title, description, children,
}: { icon: typeof Settings; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  label, description, checked, onChange, disabled,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 ${disabled ? "opacity-50" : "hover:border-foreground/20 cursor-pointer"}`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary shrink-0"
      />
    </label>
  );
}

function SelectRow({
  label, description, value, onChange, options,
}: { label: string; description?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background h-7 px-2 text-xs text-foreground focus:outline-none focus:border-foreground/30"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function SettingsV2() {
  const [devMode, setDevMode] = useDevMode();
  const [err, setErr] = useState<BridgeErrorState | null>(null);
  const [testing, setTesting] = useState<"idle" | "ok" | "fail" | "loading">("idle");
  const [lastSync, setLastSync] = useState<string | null>(() => {
    try { return localStorage.getItem("ops-v2:last-bridge-read"); } catch { return null; }
  });

  const [showMinimap, setShowMinimap] = useV2Setting(V2_SETTINGS.canvasShowMinimap);
  const [showSidePanel, setShowSidePanel] = useV2Setting(V2_SETTINGS.canvasShowSidePanel);
  const [autoOrganize, setAutoOrganize] = useV2Setting(V2_SETTINGS.canvasAutoOrganize);
  const [defaultFullscreen, setDefaultFullscreen] = useV2Setting(V2_SETTINGS.canvasDefaultFullscreen);
  const [density, setDensity] = useV2Setting(V2_SETTINGS.canvasDensity);
  const [showDock, setShowDock] = useV2Setting(V2_SETTINGS.canvasShowDock);
  const [showIAHub, setShowIAHub] = useV2Setting(V2_SETTINGS.canvasShowIAHub);
  const [nodeSize, setNodeSize] = useV2Setting(V2_SETTINGS.canvasNodeSize);
  const [renderer, setRenderer] = useV2Setting(V2_SETTINGS.canvasNodeRenderer);

  useEffect(() => subscribeBridgeError(setErr), []);

  const testConnection = async () => {
    setTesting("loading");
    try {
      await portalClient.listClients();
      setTesting("ok");
      const now = new Date().toISOString();
      try { localStorage.setItem("ops-v2:last-bridge-read", now); } catch { /* noop */ }
      setLastSync(now);
    } catch {
      setTesting("fail");
    }
  };

  const reloadCache = () => {
    clearPortalCache();
    setTesting("idle");
  };

  return (
    <>
      <HeaderV2
        title="Configurações"
        subtitle="Preferências do OPS V2 — read-only, sem mutações no Portal"
      />
      <div className="grid gap-4 max-w-4xl">
        {/* Geral */}
        <Section
          icon={Settings}
          title="Geral"
          description="Modo operação e ferramentas técnicas."
        >
          <ToggleRow
            label="Modo Dev"
            description="Habilita acesso ao OPS antigo, ferramentas técnicas e logs internos."
            checked={devMode}
            onChange={setDevMode}
          />
        </Section>

        {/* Integração Portal */}
        <Section
          icon={Database}
          title="Integração Portal"
          description="Bridge read-only para Portal Aceleriq."
        >
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-foreground">Status</p>
                <p className="text-[11px] text-muted-foreground">
                  Modo: <span className="text-foreground font-medium">{PORTAL_MODE}</span>
                </p>
              </div>
              {err ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive text-[10px] uppercase tracking-wider px-1.5 py-0.5">
                  <AlertTriangle className="h-3 w-3" /> Erro
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 text-primary text-[10px] uppercase tracking-wider px-1.5 py-0.5">
                  <CheckCircle2 className="h-3 w-3" /> OK
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Última leitura: <span className="text-foreground/80 font-mono">
                {lastSync ? new Date(lastSync).toLocaleString("pt-BR") : "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={testConnection}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testing === "loading" ? "animate-spin" : ""}`} />
                Testar conexão
              </button>
              <button
                onClick={reloadCache}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
              >
                Recarregar cache
              </button>
              {testing === "ok" && <span className="text-[11px] text-primary">Conectado</span>}
              {testing === "fail" && <span className="text-[11px] text-destructive">Falha — verifique a bridge</span>}
            </div>
          </div>
        </Section>

        {/* Canvas */}
        <Section
          icon={Layers}
          title="Canvas"
          description="Comportamento padrão do Canvas V2."
        >
          <ToggleRow
            label="Mostrar minimap"
            checked={showMinimap}
            onChange={setShowMinimap}
          />
          <ToggleRow
            label="Mostrar painel lateral"
            description="IA Hub, briefing e detalhes da tarefa selecionada."
            checked={showSidePanel}
            onChange={setShowSidePanel}
          />
          <ToggleRow
            label="Dock flutuante"
            description="Barra inferior com organizar, zoom, filtros, IA Hub e mais."
            checked={showDock}
            onChange={setShowDock}
          />
          <ToggleRow
            label="IA Hub"
            description="Orb flutuante com briefing, milestone atual e próximas ações."
            checked={showIAHub}
            onChange={setShowIAHub}
          />
          <ToggleRow
            label="Auto-organizar ao abrir"
            description="Aplica layout por status/milestone automaticamente."
            checked={autoOrganize}
            onChange={setAutoOrganize}
          />
          <ToggleRow
            label="Abrir em fullscreen por padrão"
            checked={defaultFullscreen}
            onChange={setDefaultFullscreen}
          />
          <SelectRow
            label="Renderer dos nodes"
            description='Legacy: card clássico da esteira (padrão). Task V2: card nativo do Canvas V2 com barra de progresso e responsável.'
            value={renderer}
            onChange={(v) => setRenderer(v as "legacy" | "task-v2")}
            options={[
              { value: "legacy", label: "Legacy (padrão)" },
              { value: "task-v2", label: "Task V2" },
            ]}
          />
          <SelectRow
            label="Densidade dos nodes"
            description="Confortável para detalhes; compacto para mais nodes na tela."
            value={density}
            onChange={(v) => setDensity(v as "comfortable" | "compact")}
            options={[
              { value: "comfortable", label: "Confortável" },
              { value: "compact", label: "Compacto" },
            ]}
          />
          <SelectRow
            label="Tamanho do node"
            description="Tamanho visual dos cards no Canvas."
            value={nodeSize}
            onChange={(v) => setNodeSize(v as "sm" | "md" | "lg")}
            options={[
              { value: "sm", label: "Pequeno" },
              { value: "md", label: "Médio" },
              { value: "lg", label: "Grande" },
            ]}
          />
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Resetar preferências visuais</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Volta minimap, dock, IA Hub, densidade e tamanho ao padrão.</p>
            </div>
            <button
              onClick={() => resetV2Settings()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 shrink-0"
            >
              <RotateCcw className="h-3 w-3" /> Resetar
            </button>
          </div>
        </Section>

        {/* Segurança */}
        <Section
          icon={ShieldCheck}
          title="Segurança"
          description="Estado atual de escrita no Portal."
        >
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-start gap-2.5">
            <Lock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Read-only ativo</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Todas as mutações estão desativadas. Criar / editar / deletar / mudar status / salvar layout no Portal está bloqueado nesta fase. As ações são liberadas na Fase 3.
              </p>
            </div>
          </div>
        </Section>

        {/* Legado */}
        <Section
          icon={Wrench}
          title="Legado"
          description="Acesso ao OPS antigo. Apenas para diagnóstico técnico."
        >
          {devMode ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">OPS antigo (legado)</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Mantido para inspeção do sistema anterior. Não é a experiência principal.
                </p>
              </div>
              <Link
                to="/ops-legacy"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> Abrir
              </Link>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Ative o <span className="text-foreground font-medium">Modo Dev</span> em Geral para acessar o OPS antigo.
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
