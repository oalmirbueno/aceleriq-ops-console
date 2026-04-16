import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  CalendarDays,
  Link2,
  FolderKanban,
  CheckCircle2,
  PackageCheck,
  ListChecks,
  FileText,
  FileSearch,
} from "lucide-react";
import {
  getAssetTypeLabel,
  getAssetTypeColor,
  getValidationLabel,
  getValidationColor,
} from "./assetConstants";

export interface AssetDetailRecord {
  id: string;
  workspace_id: string;
  client_id: string;
  operational_front_id: string | null;
  task_id: string | null;
  asset_type: string;
  title: string;
  description: string | null;
  external_url: string | null;
  validation_status: string;
  primary_use: string | null;
  observation: string | null;
  happened_at: string | null;
  created_at: string;
}

interface Props {
  asset: AssetDetailRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frontName?: string | null;
  taskName?: string | null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function readHostname(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function AssetDetailDialog({ asset, open, onOpenChange, frontName, taskName }: Props) {
  const host = useMemo(() => readHostname(asset?.external_url ?? null), [asset?.external_url]);

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 sm:rounded-xl overflow-hidden border-border bg-card">
        <div className="border-b border-border bg-background/80 px-6 py-5">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={getAssetTypeColor(asset.asset_type)}>
                    {getAssetTypeLabel(asset.asset_type)}
                  </Badge>
                  <Badge variant="outline" className={getValidationColor(asset.validation_status)}>
                    {getValidationLabel(asset.validation_status)}
                  </Badge>
                  {frontName && (
                    <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                      Frente: {frontName}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <DialogTitle className="text-2xl text-foreground leading-tight">
                    {asset.title}
                  </DialogTitle>
                  <DialogDescription className="max-w-3xl text-sm text-muted-foreground leading-relaxed">
                    {asset.description?.trim() || "Asset operacional registrado para comprovar entrega, execução ou resultado."}
                  </DialogDescription>
                </div>
              </div>

              {asset.external_url && (
                <Button asChild variant="outline" className="shrink-0">
                  <a href={asset.external_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir original
                  </a>
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-border bg-secondary p-2">
                      <PackageCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="label-sm">Tipo</p>
                      <p className="text-sm text-foreground truncate">{getAssetTypeLabel(asset.asset_type)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-border bg-secondary p-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="label-sm">Validação</p>
                      <p className="text-sm text-foreground truncate">{getValidationLabel(asset.validation_status)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-border bg-secondary p-2">
                      <FolderKanban className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="label-sm">Frente principal</p>
                      <p className="text-sm text-foreground truncate">{frontName ?? "Sem frente vinculada"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-border bg-secondary p-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="label-sm">Data</p>
                      <p className="text-sm text-foreground truncate">{formatDate(asset.happened_at ?? asset.created_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[calc(92vh-180px)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <Card className="border-border bg-card overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileSearch className="h-4 w-4 text-primary" /> Preview
                  </CardTitle>
                  <CardDescription>
                    {asset.external_url
                      ? "Visualização rápida do link registrado neste asset. Alguns sites podem bloquear incorporação."
                      : "Este asset não possui URL pública. A leitura abaixo resume a utilidade operacional registrada."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {asset.external_url ? (
                    <div className="space-y-3 p-4 pt-0">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                        <div className="min-w-0 flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{host ?? asset.external_url}</span>
                        </div>
                        <Button asChild size="sm" variant="ghost" className="h-7 shrink-0">
                          <a href={asset.external_url} target="_blank" rel="noopener noreferrer">
                            Abrir
                          </a>
                        </Button>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border bg-background">
                        <iframe
                          key={asset.id}
                          src={asset.external_url}
                          title={`Preview de ${asset.title}`}
                          className="h-[480px] w-full bg-background"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
                      <div className="rounded-full border border-border bg-secondary p-4">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Sem link para preview</p>
                        <p className="max-w-md text-sm text-muted-foreground">
                          Este registro funciona como prova operacional estruturada. Use os blocos ao lado para validar contexto, utilidade e vínculo com a execução.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Leitura operacional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <p className="label-sm">Descrição curta</p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {asset.description?.trim() || "Sem descrição adicional registrada."}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="label-sm">Observação</p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {asset.observation?.trim() || "Nenhuma observação registrada."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Estrutura do asset</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="label-sm">Utilidade principal</p>
                    <p className="text-sm text-foreground">{asset.primary_use?.trim() || "Não definida"}</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="label-sm">Task vinculada</p>
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <ListChecks className="h-4 w-4 text-primary shrink-0" />
                      <span>{taskName ?? "Sem task vinculada"}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="label-sm">Registrado em</p>
                    <p className="text-sm text-foreground">{formatDate(asset.created_at)}</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="label-sm">Data operacional</p>
                    <p className="text-sm text-foreground">{formatDate(asset.happened_at ?? asset.created_at)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Acesso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {asset.external_url ? (
                    <>
                      <div className="rounded-lg border border-border bg-secondary/40 p-3">
                        <p className="label-sm mb-1">URL registrada</p>
                        <p className="break-all text-sm text-foreground">{asset.external_url}</p>
                      </div>
                      <Button asChild className="w-full">
                        <a href={asset.external_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" /> Abrir asset no navegador
                        </a>
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                      Este asset não possui URL externa cadastrada.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
