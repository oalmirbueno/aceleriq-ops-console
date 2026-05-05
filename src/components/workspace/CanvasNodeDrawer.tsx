export interface CanvasNodeRecord {
  id: string;
  workspace_id: string;
  client_id?: string | null;
  node_type: string;
  title: string;
  status: string;
  description: string | null;
  pos_x: number;
  pos_y: number;
  data: Record<string, unknown> | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
  updated_at: string;
}
