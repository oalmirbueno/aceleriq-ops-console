import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, X, Layers, Pencil, Image as ImageIcon, ArrowLeftToLine, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ClientAvatar from "./ClientAvatar";

export interface CanvasClientTab {
  id: string;          // canvas_nodes.id (group node)
  title: string;       // client name
  childCount: number;
  linkedClientId: string | null;
  logoUrl?: string | null;
}

interface Props {
  tabs: CanvasClientTab[];
  activeId: string | null; // null = "Todos"
  onSelect: (id: string | null) => void;
  onAddClient: () => void;
  onRemoveClient?: (id: string) => void;
  onRenameClient?: (id: string, newTitle: string) => Promise<void> | void;
  onChangeLogo?: (id: string) => Promise<void> | void;
  onMoveToStart?: (id: string) => Promise<void> | void;
  /** Persist a new order (array of tab ids in desired sequence). */
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
  showAllTab?: boolean;
}

export default function CanvasClientTabs({
  tabs,
  activeId,
  onSelect,
  onAddClient,
  onRemoveClient,
  onRenameClient,
  onChangeLogo,
  onMoveToStart,
  onReorder,
  showAllTab = true,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (tab: CanvasClientTab) => {
    if (!onRenameClient) return;
    setEditingId(tab.id);
    setDraftTitle(tab.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  const commitEdit = async () => {
    if (!editingId || !onRenameClient) return cancelEdit();
    const next = draftTitle.trim();
    const original = tabs.find((t) => t.id === editingId)?.title ?? "";
    if (!next || next === original) return cancelEdit();
    try {
      setSaving(true);
      await onRenameClient(editingId, next);
    } finally {
      setSaving(false);
      cancelEdit();
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card/60 backdrop-blur-sm">
        <ScrollArea className="flex-1">
          <div className="flex items-center gap-1 min-w-0">
            {showAllTab && (
              <button
                onClick={() => onSelect(null)}
                className={`shrink-0 group flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-all ${
                  activeId === null
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Todos</span>
                <span className="opacity-60 text-[10px]">
                  ({tabs.length})
                </span>
              </button>
            )}

            {tabs.length > 0 && <div className="h-5 w-px bg-border mx-1 shrink-0" />}

            {tabs.map((t, idx) => {
              const active = t.id === activeId;
              const isEditing = editingId === t.id;
              const isFirst = idx === 0;

              const tabContent = (
                <div
                  className={`shrink-0 group flex items-center gap-1.5 h-9 pl-1.5 pr-1 rounded-md border text-xs font-medium transition-all ${
                    active
                      ? "bg-card border-primary/50 text-foreground shadow-sm"
                      : "border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 max-w-[260px]">
                      <ClientAvatar
                        name={draftTitle || t.title}
                        seed={t.linkedClientId ?? t.id}
                        logoUrl={t.logoUrl}
                        size="sm"
                      />
                      <input
                        ref={inputRef}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                          if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                        }}
                        onBlur={commitEdit}
                        disabled={saving}
                        maxLength={80}
                        className="bg-transparent outline-none border-b border-primary/60 text-xs font-medium min-w-[120px] max-w-[200px] px-0.5 text-foreground"
                        aria-label="Renomear cliente"
                      />
                    </div>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onSelect(t.id)}
                            onDoubleClick={(e) => {
                              if (!onRenameClient) return;
                              e.stopPropagation();
                              startEdit(t);
                            }}
                            className="flex items-center gap-1.5 max-w-[200px]"
                            title={t.title}
                          >
                            <ClientAvatar
                              name={t.title}
                              seed={t.linkedClientId ?? t.id}
                              logoUrl={t.logoUrl}
                              size="sm"
                              ring={active}
                            />
                            <span className="truncate">{t.title}</span>
                            <span className="opacity-60 text-[10px] shrink-0">
                              ({t.childCount})
                            </span>
                          </button>
                        </TooltipTrigger>
                        {onRenameClient && (
                          <TooltipContent side="bottom">
                            Duplo-clique para renomear · Botão direito para mais opções
                          </TooltipContent>
                        )}
                      </Tooltip>
                      {onRenameClient && active && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                              className="h-5 w-5 rounded flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-colors"
                              aria-label="Renomear pasta"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Renomear</TooltipContent>
                        </Tooltip>
                      )}
                      {onRemoveClient && active && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Remover a pasta de "${t.title}" do canvas? Os nodes ficarão sem pasta.`)) {
                                  onRemoveClient(t.id);
                                }
                              }}
                              className="h-5 w-5 rounded flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Remover pasta</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
              );

              // Wrap in context menu when any contextual action is available
              const hasMenu = !!(onRenameClient || onChangeLogo || onMoveToStart || onRemoveClient);
              if (!hasMenu || isEditing) {
                return <div key={t.id}>{tabContent}</div>;
              }

              return (
                <ContextMenu key={t.id}>
                  <ContextMenuTrigger asChild>
                    <div onContextMenu={() => onSelect(t.id)}>{tabContent}</div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-52">
                    {onRenameClient && (
                      <ContextMenuItem onSelect={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                      </ContextMenuItem>
                    )}
                    {onChangeLogo && (
                      <ContextMenuItem onSelect={() => onChangeLogo(t.id)}>
                        <ImageIcon className="h-3.5 w-3.5 mr-2" /> Trocar logo
                      </ContextMenuItem>
                    )}
                    {onMoveToStart && !isFirst && (
                      <ContextMenuItem onSelect={() => onMoveToStart(t.id)}>
                        <ArrowLeftToLine className="h-3.5 w-3.5 mr-2" /> Mover para o início
                      </ContextMenuItem>
                    )}
                    {onRemoveClient && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (confirm(`Remover a pasta de "${t.title}" do canvas? Os nodes ficarão sem pasta.`)) {
                              onRemoveClient(t.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover pasta
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 shrink-0 text-xs"
              onClick={onAddClient}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Cliente</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Adicionar pasta de cliente</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
