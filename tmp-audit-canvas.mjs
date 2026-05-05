import { createClient } from '@supabase/supabase-js';
const url='https://grxljyocuadywcksfyvu.supabase.co';
const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImdyeGxqeW9jdWFkeXdja3NmeXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDMzNjcsImV4cCI6MjA5MTc3OTM2N30.K1-tFjyfHdZIUDDRV5I14GTwl4mpvfGVNt55BAkgDnM'.replace('JIUzI1NiIsInJlZiI','Jpc3MiOiJodHRwczovL2dyeGxqeW9jdWFkeXdja3NmeXZ1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJyZWYi');
const actualKey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGxqeW9jdWFkeXdja3NmeXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDMzNjcsImV4cCI6MjA5MTc3OTM2N30.K1-tFjyfHdZIUDDRV5I14GTwl4mpvfGVNt55BAkgDnM';
const supabase=createClient(url,actualKey);
const { error: authErr } = await supabase.auth.signInWithPassword({ email: 'almirbarrosbueno@gmail.com', password: process.env.OPS_TEST_PASSWORD });
if (authErr) { console.error('auth-error', authErr.message); process.exit(1); }
const workspaceId='5ddd8852-798d-4508-9a33-58576f9b57ac';
const { data: ws, error: wsErr } = await supabase.from('workspaces').select('id, name, client_id, portal_project_id, clients(id,name,portal_client_id)').eq('id',workspaceId).single();
if (wsErr) console.error('ws-error', wsErr.message);
console.log('workspace', JSON.stringify(ws));
const { data: nodes, error } = await supabase.from('canvas_nodes').select('id,node_type,title,status,parent_node_id,client_id,pos_x,pos_y,data').eq('workspace_id', workspaceId).order('created_at');
if (error) { console.error('nodes-error', error.message); process.exit(1); }
const byKind = new Map();
for (const n of nodes ?? []) {
  const kind = String(n.data?.kind ?? n.node_type ?? 'unknown');
  byKind.set(kind, (byKind.get(kind) ?? 0)+1);
}
console.log('total', nodes?.length ?? 0, 'byKind', Object.fromEntries([...byKind].sort()));
const portalProjectId=ws?.portal_project_id;
const linked=(nodes??[]).filter(n=>n.data?.kind==='project_group' || n.data?.portal_project_id===portalProjectId);
console.log('portalProjectId', portalProjectId, 'linkedNodes', linked.length);
for (const n of linked.slice(0,80)) console.log('linked', n.id, n.node_type, n.data?.kind, n.title, 'parent', n.parent_node_id, 'pm', n.data?.portal_milestone_id, 'mk', n.data?.milestone_key, 'pt', n.data?.portal_task_id);
const milestones=(nodes??[]).filter(n=>n.data?.kind==='milestone_group');
console.log('milestones', JSON.stringify(milestones.map(n=>({id:n.id,title:n.title,parent:n.parent_node_id,pid:n.data?.portal_project_id,pm:n.data?.portal_milestone_id,key:n.data?.milestone_key})).slice(0,30), null, 2));
const selected='8960a398-75bf-4e04-abee-7e8441858fd6';
const selectedMs=(nodes??[]).find(n=>n.id===selected);
console.log('selectedMs', selectedMs ? JSON.stringify({id:selectedMs.id,title:selectedMs.title,data:selectedMs.data,parent:selectedMs.parent_node_id}, null, 2) : null);
const taskForSelected=(nodes??[]).filter(n=>n.id!==selected && (n.parent_node_id===selected || (selectedMs?.data?.portal_milestone_id && n.data?.portal_milestone_id===selectedMs.data.portal_milestone_id) || (n.data?.milestone_key && n.data?.milestone_key===selectedMs?.data?.milestone_key && n.data?.portal_project_id===selectedMs?.data?.portal_project_id)));
console.log('taskForSelectedCount', taskForSelected.length, JSON.stringify(taskForSelected.slice(0,30).map(n=>({id:n.id,type:n.node_type,kind:n.data?.kind,title:n.title,parent:n.parent_node_id,pt:n.data?.portal_task_id,pid:n.data?.portal_project_id,pm:n.data?.portal_milestone_id,key:n.data?.milestone_key})), null, 2));
