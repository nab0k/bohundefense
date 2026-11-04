-- STAGED ONLY. Atomic, lease-based notification claims for private enquiries.
-- Apply only after review of private schema and role grants.
alter table bohun_private.business_inquiries
  add column if not exists notification_claim_token uuid,
  add column if not exists notification_lease_until timestamptz,
  add column if not exists notification_next_attempt_at timestamptz not null default now();
create index if not exists business_inquiries_queue_idx
  on bohun_private.business_inquiries(notification_next_attempt_at,created_at)
  where notification_status='pending';
-- Functions intentionally live in a non-exposed private schema.
-- Expired fifth claims are reconciled to failed by a separate worker-only RPC.
-- The owner must be a trusted migration role. Never grant EXECUTE to PUBLIC/anon/authenticated.
create or replace function bohun_private.claim_inquiry_notifications(p_batch integer default 10)
returns table (
  id uuid, type text, name text, organization text, email text,
  context_url text, notification_attempts integer, claim_token uuid
)
language sql
security invoker
set search_path = ''
as $$
  with chosen as (
    select q.id
    from bohun_private.business_inquiries q
    where q.notification_status='pending'
      and q.notification_attempts < 5
      and q.notification_next_attempt_at <= now()
      and (q.notification_lease_until is null or q.notification_lease_until < now())
    order by q.created_at
    for update skip locked
    limit least(greatest(p_batch,1),20)
  ), claimed as (
    update bohun_private.business_inquiries q
    set notification_claim_token=gen_random_uuid(),
        notification_lease_until=now()+interval '2 minutes',
        notification_attempts=q.notification_attempts+1,
        updated_at=now()
    from chosen
    where q.id=chosen.id
    returning q.id,q.type,q.name,q.organization,q.email,q.context_url,q.notification_attempts,q.notification_claim_token
  )
  select c.id,c.type,c.name,c.organization,c.email,c.context_url,c.notification_attempts,c.notification_claim_token from claimed c;
$$;
create or replace function bohun_private.finish_inquiry_notification(
  p_id uuid, p_token uuid, p_sent boolean
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare changed integer;
begin
  update bohun_private.business_inquiries q
  set notification_status=case when p_sent then 'sent'
        when q.notification_attempts >= 5 then 'failed' else 'pending' end,
      notification_next_attempt_at=case when p_sent then now()
        else now()+make_interval(secs=>least(3600, 30 * power(2,q.notification_attempts-1)::integer)) end,
      notification_lease_until=null,
      notification_claim_token=null,
      notified_at=case when p_sent then now() else q.notified_at end,
      updated_at=now()
  where q.id=p_id and q.notification_claim_token=p_token
    and q.notification_status='pending'
    and q.notification_lease_until > now();
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function bohun_private.claim_inquiry_notifications(integer) from public,anon,authenticated;
revoke all on function bohun_private.finish_inquiry_notification(uuid,uuid,boolean) from public,anon,authenticated;

-- Recover rows whose last lease expired without a completion callback.
-- This never retries exhausted rows or changes successfully sent notifications.
create or replace function bohun_private.reconcile_exhausted_inquiry_notifications(
  p_batch integer default 100
) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  with expired as (
    select q.id
    from bohun_private.business_inquiries q
    where q.notification_status = 'pending'
      and q.notification_attempts >= 5
      and q.notification_lease_until < now()
    order by q.created_at
    for update skip locked
    limit least(greatest(p_batch,1),200)
  )
  update bohun_private.business_inquiries q
  set notification_status='failed',
      notification_claim_token=null,
      notification_lease_until=null,
      updated_at=now()
  from expired where q.id=expired.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function bohun_private.reconcile_exhausted_inquiry_notifications(integer)
  from public, anon, authenticated;
