-- STAGED ONLY: do not apply before reviewing access, retention and notification setup.
-- Private business enquiries; no public client access.
create schema if not exists bohun_private;
create table if not exists bohun_private.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}
  type text not null check (type in ('opportunity','partner','company','general')),
  name text not null check (char_length(name) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 120),
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
-- Do NOT revoke schema-wide privileges here: bohun_private is shared with
-- existing workflows. Audit its grants separately before any schema changes.
revoke all on bohun_private.business_inquiries from public, anon, authenticated;
create index if not exists business_inquiries_status_created_idx on bohun_private.business_inquiries (status, created_at desc);
comment on table bohun_private.business_inquiries is 'Private inbound BOHUN enquiries. Access through trusted server only. Retention policy to be established before activation.';
),
  type text not null check (type in ('opportunity','partner','company','general')),
  name text not null check (char_length(name) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 120),
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
-- Do NOT revoke schema-wide privileges here: bohun_private is shared with
-- existing workflows. Audit its grants separately before any schema changes.
revoke all on bohun_private.business_inquiries from public, anon, authenticated;
create index if not exists business_inquiries_status_created_idx on bohun_private.business_inquiries (status, created_at desc);
comment on table bohun_private.business_inquiries is 'Private inbound BOHUN enquiries. Access through trusted server only. Retention policy to be established before activation.';
