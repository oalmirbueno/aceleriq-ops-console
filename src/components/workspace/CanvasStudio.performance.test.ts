// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildAiOrbNodePayload, getCanvasInteractionConfig, resolveDockGroupClick, validateCanvasConnection } from "./CanvasStudio";

const row = (id: string, kind: string, parent = "client-1") => ({
  id,
  title: kind,
  node_type: kind,
  status: "draft",
  description: null,
  data: { kind },
  parent_node_id: parent,
});

describe("CanvasStudio performance-safe interactions", () => {
  it("validates AI Orb connect paths without allowing arbitrary edges", () => {
    expect(validateCanvasConnection(row("context", "contexto_ops") as any, row("orb", "ai_orb") as any)).toMatchObject({ allowed: true, label: "alimenta IA" });
    expect(validateCanvasConnection(row("orb", "ai_orb") as any, row("result", "resultado") as any)).toMatchObject({ allowed: true, label: "gerado por IA" });
    expect(validateCanvasConnection(row("metric", "metrica") as any, row("orb", "ai_orb") as any)).toMatchObject({ allowed: true });
    expect(validateCanvasConnection(row("orb", "ai_orb") as any, row("context", "contexto_ops") as any)).toMatchObject({ allowed: true });
  });

  it("returns stable select/hand interaction config", () => {
    expect(getCanvasInteractionConfig("select")).toEqual({ panOnDrag: [0, 1, 2], selectionOnDrag: true });
    expect(getCanvasInteractionConfig("hand")).toEqual({ panOnDrag: true, selectionOnDrag: false });
  });

  it("resolves dock open/close without extra state derivation", () => {
    expect(resolveDockGroupClick(null, "ai")).toBe("ai");
    expect(resolveDockGroupClick("ai", "ai")).toBeNull();
    expect(resolveDockGroupClick("ai", "proof")).toBe("proof");
  });

  it("builds AI Orb payload for gerar interaction", () => {
    const payload = buildAiOrbNodePayload({ orbType: "proof", workspaceId: "w1", clientId: "c1", parentNodeId: "folder-1", x: 660, y: 584 });
    expect(payload).toMatchObject({ node_type: "ai_orb", title: "AI Orb · Provas", pos_x: 660, pos_y: 584, parent_node_id: "folder-1" });
    expect(payload.data).toMatchObject({ kind: "ai_orb", orbType: "proof", aiEngine: "internal", isGenerating: false, generationCount: 0 });
  });
});