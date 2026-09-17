# Peck IT Ticketing

A school IT support application for submitting and tracking tickets across the main and Pre-K buildings. Features include ticket conversations, unread replies, photo attachments, account requests, and role-based views for requesters, technicians, and administrators.

## Tech stack

Next.js 16 App Router, React 19, TypeScript, CSS Modules, and Supabase Auth, Postgres, Realtime, and private Storage. Dependencies are locked in `package-lock.json`; ESLint provides lint checks.

## Local setup

Use Node.js compatible with Next.js 16 and npm. The repository does not pin a Node.js version. A Supabase development project with the base database and Auth configuration below is also required.

1. Run `npm ci` to install locked dependencies.
2. Copy `.env.example` to `.env.local` and replace its placeholders with development-project values.
3. Prepare the database and Auth configuration below.
4. Run `npm run dev` and open http://localhost:3000.

Run `npm run lint` and `npm run build` for checks. `npm start` serves a completed production build. No automated test script is defined.

## Environment variables

Keep real configuration in the ignored `.env.local`. The example contains placeholders only. Restart development after changes; rebuild when browser-visible values change.

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project URL, also used by keepalive. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible | Public anon key. Database and Storage policies must enforce access. |
| `NEXT_PUBLIC_ACCOUNT_REQUEST_REQUESTER_ID` | Browser-visible | Existing requester UUID for account-request tickets; required for that flow, not an authorization secret. |
| `CRON_SECRET` | Server-only secret | Bearer token protecting keepalive; use a strong random value. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Privileged key for keepalive. Never expose it to the browser. |
| `MAINTENANCE_REQUESTER_ID` | Server-only configuration | Existing requester UUID for maintenance tickets. |

The last three variables are only needed for the keepalive endpoint. Its existing schedule is in `vercel.json`. An authorized request to `/api/cron/supabase-keepalive` reads ticket activity and creates a low-priority maintenance ticket after five days without a new ticket. Calling it can write to the database.

## Database and Auth prerequisites

The migrations are incremental, not a complete initial schema. Obtain a reviewed, sanitized base-schema setup from the maintainer before creating a new development database. The repository does not define:

- Base `profiles`, `tickets`, and `ticket_comments` tables, their original grants, row-level security policies, and supporting constraints.
- The `request_password_reset` and `ticket_profile_emails` RPCs used by the app.
- Account/profile provisioning, including `role`, `must_change_password`, and `password_changed_at` profile fields and initial requester accounts.
- Auth signup, email confirmation, email delivery, site URL, and redirect configuration. Review these for the development origin and `/auth/callback` route.

The account-request page inserts tickets directly from the browser, including before sign-in. Its configured requester must exist, and appropriate grants and policies must support that flow. UI role checks alone do not secure data. Confirm access rules and provisioning with the maintainer rather than guessing missing policies.

## Database migrations

After obtaining the base schema, apply these files in order to the development database using the Supabase SQL Editor:

1. `supabase/migrations/20260819000000_add_ticket_comment_reads.sql`: read state, unread-count RPC, and ticket-comment Realtime publication.
2. `supabase/migrations/20260825000000_add_ticket_attachments.sql`: private attachment bucket, metadata, limits, and access policies.
3. `supabase/migrations/20260826000000_add_ticket_building.sql`: building field, constraint, index, and backfill of existing tickets to the main building.

Alternatively, with the Supabase CLI already configured and linked to the intended development project, reconcile its migration history and run `supabase db push` for pending migrations. The CLI and project configuration are not included. Verify the target first: migrations change database state. Some policy statements are not rerunnable, so do not blindly reapply completed migrations.
