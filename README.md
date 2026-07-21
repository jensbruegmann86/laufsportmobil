# Laufsportmobil SaaS

SaaS platform for organizing and monetizing sponsored school charity runs (Sponsorenlaeufe).

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Supabase (Auth + PostgreSQL)
- Stripe
- Vercel

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Add your Supabase and Stripe keys to `.env.local`.

4. Start development server:

```bash
npm run dev
```

## Supabase Schema & RLS

Initial schema + complete RLS policies are defined in:

- `supabase/migrations/202607210001_init_schema.sql`

Apply using Supabase CLI:

```bash
supabase db push
```

Or copy the SQL into the Supabase SQL Editor and run it directly.

## Vercel Deployment

Deployment is Git-based:

1. Push to GitHub.
2. Import repository in Vercel.
3. Configure environment variables in Vercel project settings.

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `TEACHER_RUN_LINK_SECRET`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Supabase Type Generation

Regenerate `database.types.ts` after schema updates:

```bash
supabase gen types typescript --schema public > src/lib/supabase/database.types.ts
```

## Full Manual Test Flow

1. Open `/auth/register` and create admin/teacher users.
2. Ensure each user has a row in `profiles` (`role`, `school_id`).
3. Login via `/auth/login` and open `/dashboard`.
4. Create an event at `/dashboard/runs/new`.
5. Manage students at `/dashboard/runs/[runId]/students` (single or bulk).
6. Open `/dashboard/students` and test QR / sponsor links.
7. Enter laps at `/dashboard/runs/[runId]/results`.
8. Verify sponsor notification emails are sent via SMTP.
9. Open sponsor payment link `/pay/[token]` and complete Stripe checkout.
