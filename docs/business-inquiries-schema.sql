-- STAGED ONLY: do not apply before reviewing access, retention and notification setup.
-- Private business enquiries; no public client access.
create schema if not exists bohun_private;
create table if not exists bohun_private.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('opportunity','partner','company')),
  name text not null check (char_length(name) between 1 and 120),
  organization text not null check (char_length(organization) between 1 and 160),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 4000),
  relationship text,
  region text,
  source_url text,
  context_type text,
  context_id text,
  context_url text,
  status text not null default 'new' check (status in ('new','in_review','contacted','closed','rejected')),
  notification_status text not null default 'pending' check (notification_status in ('pending','sent','failed')),
  notification_attempts integer not null default 0,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table bohun_private.business_inquiries enable row level security;
revoke all on schema bohun_private from public, anon, authenticated;
revoke all on bohun_private.business_inquiries from public, anon, authenticated;
create index if not exists business_inquiries_status_created_idx on bohun_private.business_inquiries (status, created_at desc);
comment on table bohun_private.business_inquiries is 'Private inbound BOHUN enquiries. Access through trusted server only. Retention policy to be established before activation.';
