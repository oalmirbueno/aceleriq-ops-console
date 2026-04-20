import { useEffect, useRef, useState } from "react";
import {
  FileText, FileSpreadsheet, FileImage, FileVideo, FileCode2, File as FileIcon,
  Figma, Loader2, AlertCircle, Maximize2,
} from "lucide-react";
import AttachmentLightbox from "./AttachmentLightbox";

interface Props {
  url: string;
  type?: string;
  label?: string;
  storagePath?: string;
  /** Called to refresh signed url when expired (returns new URL or original) */
  onRefreshUrl?: () => Promise<string | undefined>;
  className?: string;
  /** Disable click-to-open lightbox */
  disableLightbox?: boolean;
}

const IMAGE_TYPES = ["image", "jpg", "jpeg", "png", "webp", "gif", "svg"];
const VIDEO_TYPES = ["video", "mp4", "mov", "webm"];

function isImage(t?: string) {
  return !!t && IMAGE_TYPES.includes(t.toLowerCase());
}
function isPdf(t?: string) {
  return t?.toLowerCase() === "pdf";
}
function isVideo(t?: string) {
  return !!t && VIDEO_TYPES.includes(t.toLowerCase());
}

function FallbackIcon({ type }: { type?: string }) {
  const t = type?.toLowerCase() ?? "";
  const cls = "h-7 w-7 text-muted-foreground";
  if (["doc", "docx"].includes(t)) return <FileText className={cls} />;
  if (["xls", "xlsx", "csv", "sheet"].includes(t)) return <FileSpreadsheet className={cls} />;
  if (["fig", "figma"].includes(t)) return <Figma className={cls} />;
  if (["json", "html", "css", "js", "ts", "tsx", "jsx"].includes(t)) return <FileCode2 className={cls} />;
  if (isImage(t)) return <FileImage className={cls} />;
  if (isVideo(t)) return <FileVideo className={cls} />;
  return <FileIcon className={cls} />;
}

/**
 * Renders an inline 64×64 thumbnail for an attachment.
 * - Images: shows <img>
 * - PDF: renders first page with pdfjs-dist (lazy-loaded)
 * - Video: <video> tag, frame at metadata
 * - Other: typed icon
 */
export default function AttachmentPreview({ url, type, label, onRefreshUrl, className, disableLightbox }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfRendered, setPdfRendered] = useState(false);
  const [errored, setErrored] = useState(false);
  const [activeUrl, setActiveUrl] = useState(url);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setActiveUrl(url);
    setErrored(false);
    setPdfRendered(false);
  }, [url]);

  /* Render PDF first page */
  useEffect(() => {
    if (!isPdf(type)) return;
    if (!activeUrl) return;
    if (pdfRendered || pdfLoading) return;

    let cancelled = false;
    (async () => {
      setPdfLoading(true);
      try {
        // Lazy import — keeps pdfjs out of main bundle
        const pdfjs = await import("pdfjs-dist");
        // Worker via CDN (avoids bundling worker)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const tryLoad = async (u: string) => pdfjs.getDocument({ url: u, disableRange: false }).promise;
        let pdf;
        try {
          pdf = await tryLoad(activeUrl);
        } catch {
          // Maybe expired signed URL — refresh and retry
          const fresh = onRefreshUrl ? await onRefreshUrl() : undefined;
          if (fresh && fresh !== activeUrl) {
            setActiveUrl(fresh);
            pdf = await tryLoad(fresh);
          } else {
            throw new Error("pdf load failed");
          }
        }
        if (cancelled) return;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetW = 128; // hi-res for retina (displayed 64)
        const scale = targetW / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = scaled.width;
        canvas.height = scaled.height;

        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        if (!cancelled) setPdfRendered(true);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeUrl, type, pdfRendered, pdfLoading, onRefreshUrl]);

  const baseCls = `relative h-16 w-16 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 ${className ?? ""}`;

  /* Image */
  if (isImage(type) && activeUrl) {
    return (
      <div className={baseCls}>
        {!errored ? (
          <img
            src={activeUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={async () => {
              if (onRefreshUrl) {
                const fresh = await onRefreshUrl();
                if (fresh && fresh !== activeUrl) {
                  setActiveUrl(fresh);
                  return;
                }
              }
              setErrored(true);
            }}
          />
        ) : (
          <FallbackIcon type={type} />
        )}
      </div>
    );
  }

  /* Video */
  if (isVideo(type) && activeUrl) {
    return (
      <div className={baseCls}>
        {!errored ? (
          <video
            src={activeUrl}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <FallbackIcon type={type} />
        )}
      </div>
    );
  }

  /* PDF */
  if (isPdf(type)) {
    return (
      <div className={baseCls}>
        <canvas
          ref={canvasRef}
          className={`h-full w-full object-cover ${pdfRendered ? "opacity-100" : "opacity-0"} transition-opacity`}
        />
        {!pdfRendered && !errored && (
          <div className="absolute inset-0 flex items-center justify-center">
            {pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <FileText className="h-7 w-7 text-rose-400" />
            )}
          </div>
        )}
        {errored && (
          <div className="absolute inset-0 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {pdfRendered && (
          <span className="absolute bottom-0 left-0 right-0 bg-rose-500/80 text-[8px] font-bold uppercase text-white text-center leading-tight py-0.5">
            PDF
          </span>
        )}
      </div>
    );
  }

  /* Fallback */
  return (
    <div className={baseCls}>
      <FallbackIcon type={type} />
    </div>
  );
}
