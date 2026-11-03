-- REVIEW ONLY: do not apply to production without approval.
-- Apply AFTER docs/business-inquiries-schema.sql and docs/business-inquiries-queue.sql.
-- Separate NOLOGIN capability roles. Provision dedicated LOGIN roles and credentials
-- outside Git, then GRANT each capability role to its corresponding LOGIN role.
-- The existing bohun_private schema is not exposed to PostgREST.
begin;
create role bohun_inquiry_intake nologin;
create role bohun_inquiry_worker nologin;
grant usage on schema bohun_private to bohun_inquiry_intake, bohun_inquiry_worker;
grant insert on bohun_private.business_inquiries to bohun_inquiry_intake;
-- INSERT ... RETURNING id requires SELECT on id.
grant select (id) on bohun_private.business_inquiries to bohun_inquiry_intake;
grant select (id,type,name,organization,email,context_url,notification_attempts,
  notification_status,notification_next_attempt_at,notification_lease_until,
  notification_claim_token,created_at) on bohun_private.business_inquiries
  to bohun_inquiry_worker;
grant update (notification_claim_token,notification_lease_until,
  notification_attempts,notification_status,notification_next_attempt_at,
  notified_at,updated_at) on bohun_private.business_inquiries
  to bohun_inquiry_worker;
grant execute on function bohun_private.claim_inquiry_notifications(integer) to bohun_inquiry_worker;
grant execute on function bohun_private.finish_inquiry_notification(uuid,uuid,boolean) to bohun_inquiry_worker;
-- RLS must permit ONLY these server-only roles. No anon/authenticated policies.
create policy inquiry_intake_insert on bohun_private.business_inquiries
  for insert to bohun_inquiry_intake with check (true);
create policy inquiry_intake_receipt on bohun_private.business_inquiries
  for select to bohun_inquiry_intake using (true);
create policy inquiry_worker_select on bohun_private.business_inquiries
  for select to bohun_inquiry_worker using (true);
create policy inquiry_worker_update on bohun_private.business_inquiries
  for update to bohun_inquiry_worker using (true) with check (true);

-- Durable, privacy-minimized fixed-hour-window rate counter.
-- The caller supplies a server-side HMAC-SHA256 of trusted client identity,
-- never a raw IP. The HMAC key must be an Edge Function secret.
create table if not exists bohun_private.inquiry_rate_limits (
  identity_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key(identity_hash,window_start),
  check (length(identity_hash)=64),
  check (hits>=1)
);
alter table bohun_private.inquiry_rate_limits enable row level security;
revoke all on bohun_private.inquiry_rate_limits from public,anon,authenticated;
-- SECURITY DEFINER is intentional: the caller must not have direct counter
-- table privileges. The function MUST be owned by a dedicated limited owner
-- with INSERT/UPDATE/SELECT rights and an explicit RLS policy, or a narrowly
-- scoped BYPASSRLS role after a separate security review. Do not deploy with
-- an unreviewed superuser function owner.
create or replace function bohun_private.allow_inquiry_attempt(
  p_hash text, p_max integer default 5
) returns boolean
language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
  if p_hash !~ '^[0-9a-f]{64}$' or p_max not between 1 and 20 then
    raise exception 'invalid rate-limit parameters';
  end if;
  insert into bohun_private.inquiry_rate_limits(identity_hash,window_start,hits)
    values (p_hash,date_trunc('hour',now()),1)
    on conflict(identity_hash,window_start)
    do update set hits=bohun_private.inquiry_rate_limits.hits+1
    returning hits into n;
  return n <= p_max;
end;
$$;
revoke all on function bohun_private.allow_inquiry_attempt(text,integer)
  from public,anon,authenticated;
grant execute on function bohun_private.allow_inquiry_attempt(text,integer)
  to bohun_inquiry_intake;
grant select, insert, update on bohun_private.inquiry_rate_limits to bohun_inquiry_intake;
create policy inquiry_rate_limit_select on bohun_private.inquiry_rate_limits
  for select to bohun_inquiry_intake using (true);
create policy inquiry_rate_limit_insert on bohun_private.inquiry_rate_limits
  for insert to bohun_inquiry_intake with check (true);
create policy inquiry_rate_limit_update on bohun_private.inquiry_rate_limits
  for update to bohun_inquiry_intake using (true) with check (true);
-- Retention: schedule trusted cleanup of expired counters (e.g. older than 48h).
commit;

-- REVIEW CHECKS: ensure anon/authenticated cannot USAGE private schema,
-- SELECT/INSERT enquiries, or EXECUTE private RPCs; test actual role sessions.
-- IMPORTANT: no grants to existing login roles are made by this file.
-- SECURITY REVIEW: a definer-owned function must be audited for ownership,
-- search_path, function EXECUTE grants, and database role inheritance.
