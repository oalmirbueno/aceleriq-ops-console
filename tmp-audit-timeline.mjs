import { createClient } from '@supabase/supabase-js';
const supabase=createClient('https://grxljyocuadywcksfyvu.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGxqeW9jdWFkeXdja3NmeXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDMzNjcsImV4cCI6MjA5MTc3OTM2N30.K1-tFjyfHdZIUDDRV5I14GTwl4mpvfGVNt55BAkgDnM');
const { error: authErr } = await supabase.auth.signInWithPassword({ email: 'almirbarrosbueno@gmail.com', password: process.env.OPS_TEST_PASSWORD });
if (authErr) { console.error(authErr.message); process.exit(1); }
const workspaceId='5ddd8852-798d-4508-9a33-58576f9b57ac';
const { data: events, error } = await supabase.from('timeline_events').select('id,event_type,title,description,happened_at,payload').eq('workspace_id', workspaceId).order('happened_at',{ascending:true}).limit(500);
if(error){console.error(error.message);process.exit(1)}
const byKind={};
for(const e of events??[]){const k=e.payload?.kind??e.event_type; byKind[k]=(byKind[k]??0)+1}
console.log('events', events?.length, byKind);
for(const e of (events??[]).filter(e=>String(e.title).includes('Portal') || e.payload?.kind?.includes?.('portal')).slice(0,80)) console.log(JSON.stringify(e));
