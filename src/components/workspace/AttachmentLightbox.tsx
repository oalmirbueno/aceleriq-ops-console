import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight,
  Loader2, AlertCircle,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
  type?: string;
  label?: string;
  /** Refresh signed URL when expired */
  onRefreshUrl?: () => Promise<string | undefined>;
}

const IMAGE_TYPES = ["image", "jpg", "jpeg", "png", "webp", "gif", "svg"];
const VIDEO_TYPES = ["video", "mp4", "mov", "webm"];
const isImage = (t?: string) => !!t && IMAGE_TYPES.includes(t.toLowerCase());
const isVideo = (t?: string) => !!t && VIDEO_TYPES.includes(t.toLowerCase());
const isPdf = (t?: string) => t?.toLowerCase() === "pdf";

export default function AttachmentLightbox({
  open, onOpenChange, url, type, label, onRefreshUrl,
}: Props) {
  const [activeUrl, setActiveUrl] = useState(url);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [errored, setErrored] = useState(false);

  // PDF state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveUrl(url);
      setZoom(1);
      setRotation(0);
      setErrored(false);
      setPdfDoc(null);
      setPdfPage(1);
    }
  }, [open, url]);

  /* Load PDF document */
  useEffect(() => {
    if (!open || !isPdf(type) || !activeUrl || pdfDoc) return;
    let cancelled = false;
    (async () => {
      setPdfLoading(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const tryLoad = async (u: string) => pdfjs.getDocument({ url: u }).promise;
        let doc;
        try {
          doc = await tryLoad(activeUrl);
        } catch {
          const fresh = onRefreshUrl ? await onRefreshUrl() : undefined;
          if (fresh && fresh !== activeUrl) {
            setActiveUrl(fresh);
            doc = await tryLoad(fresh);
          } else throw new Error("pdf load failed");
        }
        if (!cancelled) setPdfDoc(doc as never);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, type, activeUrl, pdfDoc, onRefreshUrl]);

  /* Render PDF page */
  useEffect(() => {
    if (!pdfDoc || !isPdf(type)) return;
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = await (pdfDoc as any).getPage(pdfPage);
        const baseViewport = page.getViewport({ scale: 1 });
        // Fit to ~80% of viewport width
        const targetW = Math.min(window.innerWidth * 0.85, 1100);
        const fitScale = targetW / baseViewport.width;
        const scaled = page.getViewport({ scale: fitScale * zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pdfPage, zoom, type]);

  /* Keyboard shortcuts */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.2, 4));
      else if (e.key === "-") setZoom((z) => Math.max(z - 0.2, 0.25));
      else if (e.key === "0") { setZoom(1); setRotation(0); }
      else if (e.key === "ArrowLeft" && pdfDoc) setPdfPage((p) => Math.max(1, p - 1));
      else if (e.key === "ArrowRight" && pdfDoc) setPdfPage((p) => Math.min((pdfDoc.numPages ?? 1), p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pdfDoc]);

  const handleDownload = async () => {
    let dlUrl = activeUrl;
    try {
      const res = await fetch(dlUrl);
      if (!res.ok && onRefreshUrl) {
        const fresh = await onRefreshUrl();
        if (fresh) dlUrl = fresh;
      }
    } catch { /* fall through */ }
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = label || "download";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const renderContent = () => {
    if (errored) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <AlertCircle className="h-10 w-10" />
          <p className="text-sm">Não foi possível carregar este anexo.</p>
        </div>
      );
    }

    if (isImage(type)) {
      return (
        <div className="flex items-center justify-center overflow-auto max-h-[75vh] min-h-[40vh]">
          <img
            src={activeUrl}
            alt={label || ""}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: "transform 0.15s ease-out",
            }}
            className="max-w-full max-h-[75vh] object-contain select-none"
            onError={async () => {
              if (onRefreshUrl) {
                const fresh = await onRefreshUrl();
                if (fresh && fresh !== activeUrl) { setActiveUrl(fresh); return; }
              }
              setErrored(true);
            }}
            draggable={false}
          />
        </div>
      );
    }

    if (isVideo(type)) {
      return (
        <div className="flex items-center justify-center bg-black/40 rounded-md">
          <video
            src={activeUrl}
            controls
            autoPlay
            className="max-w-full max-h-[75vh]"
            onError={() => setErrored(true)}
          />
        </div>
      );
    }

    if (isPdf(type)) {
      return (
        <div className="flex flex-col items-center gap-3">
          {pdfLoading && !pdfDoc && (
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando PDF...</span>
            </div>
          )}
          <div className="overflow-auto max-h-[72vh] w-full flex justify-center bg-muted/20 rounded-md p-3">
            <canvas ref={canvasRef} className="shadow-lg" />
          </div>
          {pdfDoc && pdfDoc.numPages > 1 && (
            <div className="flex items-center gap-3 text-xs">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={pdfPage <= 1}
                onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-mono text-muted-foreground">
                {pdfPage} / {pdfDoc.numPages}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={pdfPage >= pdfDoc.numPages}
                onClick={() => setPdfPage((p) => Math.min(pdfDoc.numPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    // Generic fallback — try iframe (works for many doc types)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">
          Pré-visualização indisponível para este tipo de arquivo.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleDownload} variant="default" size="sm">
            <Download className="h-4 w-4 mr-1.5" /> Baixar
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={activeUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir em nova aba
            </a>
          </Button>
        </div>
      </div>
    );
  };

  const showZoomControls = isImage(type) || isPdf(type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-5xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/50">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-medium truncate">
              {label || "Anexo"}
            </DialogTitle>
            <DialogDescription className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {type || "arquivo"}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {showZoomControls && (
              <>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.25))}
                  title="Diminuir zoom (-)"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-[11px] font-mono text-muted-foreground w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 4))}
                  title="Aumentar zoom (+)"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                {isImage(type) && (
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    title="Rotacionar"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                )}
                <span className="w-px h-5 bg-border mx-1" />
              </>
            )}
            <Button
              size="icon" variant="ghost" className="h-8 w-8"
              onClick={handleDownload}
              title="Baixar"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir em nova aba">
              <a href={activeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="p-4 bg-background/95 max-h-[85vh] overflow-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
