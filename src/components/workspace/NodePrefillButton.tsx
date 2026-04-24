import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  nodeId: string;
  nodeKind: string;
  workspaceId: string;
  onPrefilled?: () => void;
  size?: "sm" | "xs";
}

export default function NodePrefillButton({ nodeId, nodeKind, workspaceId, onPrefilled, size = "xs" }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePrefill = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("prefill-node-v2", {
        body: { nodeId, nodeKind, workspaceId },
      });
      if (error) throw error;
      toast({
        title: "Preenchido com IA",
        description: `Campos de "${nodeKind}" foram rascunhados com base no contexto.`,
      });
      onPrefilled?.();
    } catch (err) {
      toast({
        title: "Erro ao preencher",
        description: err instanceof Error ? err.message : "Falha na geração automática.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  return (
    <button
      type="button"
      onClick={handlePrefill}
      disabled={loading}
      className={`${sizeClasses} flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition-all hover:scale-110 hover:border-primary/50 hover:bg-primary/20 disabled:opacity-50`}
      aria-label="Preencher com IA"
      title="Gerar conteúdo com base no contexto"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
    </button>
  );
}