-- ════════════════════════════════════════════════════════════
-- Aura AI — Supabase Schema
-- Run this in Supabase SQL Editor after creating your project
-- ════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Leads table ──────────────────────────────────────────────
create table if not exists leads (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  email           text not null,
  phone           text,
  spa_name        text,

  -- Calculator outputs
  monthly_loss    integer default 0,
  weekly_appts    integer default 0,
  avg_value       integer default 0,

  -- Attribution
  utm_source      text default 'direct',
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  referrer        text,
  landing_page    text,

  -- Metadata
  source          text default 'calculator',
  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  -- CRM fields (fill in manually or via future automation)
  status          text default 'new',   -- new, contacted, qualified, closed_won, closed_lost
  notes           text,
  called_at       timestamptz,
  booked_at       timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists leads_email_idx        on leads(email);
create index if not exists leads_submitted_at_idx on leads(submitted_at desc);
create index if not exists leads_status_idx       on leads(status);
create index if not exists leads_monthly_loss_idx on leads(monthly_loss desc);

-- ── Row Level Security ────────────────────────────────────────
-- IMPORTANT: Enable RLS so only service_role key can insert/read
alter table leads enable row level security;

-- Block all access by default (service_role bypasses RLS — that's what the function uses)
-- No policies needed — service_role key in the function has full access
-- The anon key (used in browser) has NO access to this table

-- ── Useful views ─────────────────────────────────────────────
create or replace view lead_summary as
select
  date_trunc('day', submitted_at) as date,
  count(*)                        as total_leads,
  count(*) filter (where monthly_loss >= 5000) as priority_leads,
  avg(monthly_loss)::integer      as avg_monthly_loss,
  max(monthly_loss)               as max_monthly_loss,
  count(distinct utm_source)      as sources
from leads
group by 1
order by 1 desc;

-- ════════════════════════════════════════════════════════════
-- SETUP INSTRUCTIONS
-- ════════════════════════════════════════════════════════════
--
-- 1. Create a Supabase project at supabase.com
--    → Name it "aura-ai" or similar
--
-- 2. Run this SQL in: Supabase Dashboard → SQL Editor → New Query
--
-- 3. Get your keys: Settings → API
--    → Copy "URL" (looks like https://xxxx.supabase.co)
--    → Copy "service_role" key (NOT the anon key)
--
-- 4. Add to Netlify: Site → Environment Variables
--    SUPABASE_URL         = https://xxxx.supabase.co
--    SUPABASE_SERVICE_KEY = eyJhbGc... (service_role key)
--    NOTIFY_EMAIL         = plexs7@gmail.com
--    RESEND_API_KEY       = re_xxxx (get free at resend.com — BAA available)
--
-- 5. Upgrade to Supabase Pro ($25/mo) and request BAA:
--    supabase.com/docs/guides/platform/hipaa (they call it "HIPAA add-on")
--    Note: HIPAA add-on is an additional $599/mo on top of Pro for dedicated
--    infrastructure. For early stage, track manually and upgrade when a client
--    requires it. The data is still encrypted at rest and in transit on any plan.
--
-- 6. Deploy — Netlify auto-deploys from GitHub
--
-- ════════════════════════════════════════════════════════════
