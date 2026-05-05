-- Agenda reconciliação automática Portal→Ops (cobre deleções) a cada 1 min.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  job_id int;
begin
  select jobid into job_id from cron.job where jobname = 'portal-reconcile-every-minute';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'portal-reconcile-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://grxljyocuadywcksfyvu.supabase.co/functions/v1/backfill-from-portal',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source','cron')
  );
  $$
);
