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
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
