import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildAiOrbNodePayload, NodeTypeDock, OperationalCanvasToolbar, validateCanvasConnection } from "./CanvasStudio";

const row = (id: string, kind: string, parent = "client-1") => ({
  id,
  title: kind,
  node_type: kind,
  status: "draft",
  description: null,
  data: { kind },
  parent_node_id: parent,
});

describe("CanvasStudio AI Orb interactions", () => {
  it("validates AI Orb input and output without allowing arbitrary edges", () => {
    expect(validateCanvasConnection(row("context", "contexto_ops") as any, row("orb", "ai_orb") as any)).toMatchObject({ allowed: true, label: "treina" });
    expect(validateCanvasConnection(row("orb", "ai_orb") as any, row("result", "resultado") as any)).toMatchObject({ allowed: true, label: "gera IA" });
    expect(validateCanvasConnection(row("metric", "metrica") as any, row("orb", "ai_orb") as any).allowed).toBe(false);
    expect(validateCanvasConnection(row("orb", "ai_orb") as any, row("context", "contexto_ops") as any).allowed).toBe(false);
  });

  it("builds stable AI Orb payloads for gerar interaction", () => {
    const payload = buildAiOrbNodePayload({ orbType: "proof", workspaceId: "w1", clientId: "c1", parentNodeId: "folder-1", x: 660, y: 584 });
    expect(payload).toMatchObject({ node_type: "ai_orb", title: "AI Orb · Provas", pos_x: 660, pos_y: 584, parent_node_id: "folder-1" });
    expect(payload.data).toMatchObject({ kind: "ai_orb", orbType: "proof", aiModel: "internal", isGenerating: false });
  });

  it("keeps toolbar select/hand interactions isolated", () => {
    const onToolChange = vi.fn();
    render(
      <OperationalCanvasToolbar
        activeTool="select"
        gridVisible
        lockedNodes={false}
        fullscreen={false}
        onToolChange={onToolChange}
        onFit={vi.fn()}
        onToggleLock={vi.fn()}
        onToggleGrid={vi.fn()}
        onToggleFullscreen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Mover canvas · H"));
    expect(onToolChange).toHaveBeenCalledWith("hand");
  });

  it("opens AI dock and triggers one orb generation callback", () => {
    const onOpenGroup = vi.fn();
    const onPickOrb = vi.fn();
    const { rerender } = render(<NodeTypeDock openGroup={null} onOpenGroup={onOpenGroup} onPickKind={vi.fn()} onPickOrb={onPickOrb} />);
    fireEvent.click(screen.getByText("IA"));
    expect(onOpenGroup).toHaveBeenCalledWith("ai");

    rerender(<NodeTypeDock openGroup="ai" onOpenGroup={onOpenGroup} onPickKind={vi.fn()} onPickOrb={onPickOrb} />);
    fireEvent.click(screen.getByText("Planejar"));
    expect(onPickOrb).toHaveBeenCalledTimes(1);
    expect(onPickOrb).toHaveBeenCalledWith("planner");
  });
});