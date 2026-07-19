# SourcemAI

## What this app does
AI-powered Sales Intelligence Layer — monitors funding events, GTM hiring signals, and CRM activity; delivers a ranked daily digest of high-priority account recommendations to reps via mobile PWA with push notifications.

## Stack
Express.js + PostgreSQL (Neon) + Polsia Email Proxy + Polsia AI (Agent SDK).

## Directory map
- `db/` — all database access. `db/index.js` creates Pool; others are query modules.
- `routes/` — Express routers. Each file is one endpoint group.
- `services/` — business logic (AI generation, email proxy, warmup rotation, signal scoring, digest generation).
- `jobs/` — cron job entry points (run via polsia.toml [[crons]]).
- `migrations/` — SQL schema changes (timestamped JS migration files).
- `lib/` — landing page context builder.
- `views/` — EJS templates for public landing page.
- `public/` — static assets (CSS, PWA at public/digest/).
- `public/digest/` — mobile-first Sales Digest PWA (index.html, app.js, sw.js, manifest.json).

## Database
- `prospects` — name, email, company, linkedin_url, icp_data (JSONB), status, source
- `campaigns` — name, icp_description, email_account_id, daily_limit, status
- `email_accounts` — email_address, display_name, warmup_enabled, warmup_daily_count, is_primary
- `sent_emails` — prospect_id, campaign_id, subject, body, sent_at, ai_generated
- `replies` — sent_email_id, category, ai_categorization, crm_routed, routed_at
- `_migrations` — auto-tracked by migrate.js
- `email_warmup_logs` — email_account, warmup_status, sent_at, replied_at, created_at
- `reps` — sales rep records (id, name, email, role, is_active)
- `accounts` — company accounts with rep assignment, signal scores, CRM linkage
- `contacts` — per-account contacts with primary flag
- `signals` — raw signal events (funding, hiring, CRM activity, news) per account
- `signal_scores` — weighted scores per account per scoring run (funding=3pts, hiring=2pts, crm=2pts)
- `digest_batches` — one batch per rep per day, published each morning
- `digest_entries` — account entries in a batch with priority, why-one-liner, recommended action, action status
- `push_subscriptions` — Web Push VAPID subscriptions per rep
- `ab_test_events` — A/B test impressions and CTA click-throughs (experiment, variant, event, visitor_id)

## External integrations
- **Polsia Email Proxy** — sends via outboundos53@polsia.app, receives inbound via webhook
- **Polsia AI (Agent SDK)** — prospect research, email generation, reply categorization, signal scoring
- **Crunchbase API** — funding events (set CRUNCHBASE_API_KEY env var to enable)
- **LinkedIn Jobs / job board APIs** — hiring signals (placeholder for v1)
- **Salesforce / HubSpot** — CRM read-only sync (integration in progress)

## Recent changes
- (2026-06-26) Reply intent detection: updated reply-categorizer to classify interested/not_interested/off_topic/unsubscribe; webhook routes interested leads to high_priority_leads CRM tag, sends courteous unsubscribe prompt on off-topic replies
- (2026-06-24) A/B test: hero headline variant B ("Your pipeline, ranked by purchase intent.") with CTA click-through tracking; POST /api/ab-test/track, GET /api/ab-test/results
- (2026-06-21) Pivoted landing page to Sales Intelligence positioning: updated hero headline, How It Works copy, About section, outcomes stats, comparison (removed Apollo table, replaced with simple value prop list), and footer tagline
- (2026-06-20) Built Sales Intelligence Layer v1: signal scoring engine, digest generator, mobile PWA, Web Push notifications
- (2026-06-12) Added email_warmup_logs table for warmup tracking
- (2026-06-04) Added email sequence template engine
- (2026-05-28) Initial outreach agent loop build