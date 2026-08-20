This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Supabase inactivity keepalive

Free-tier Supabase projects can be paused after a week of low activity. The
`/api/cron/supabase-keepalive` endpoint performs an external database request
every day. If no ticket has been created in the last five days, it creates a
low-priority maintenance ticket so the keepalive is visible in the normal
support workflow.

The daily schedule is declared in `vercel.json` and is enabled when the app is
deployed to Vercel. Configure these environment variables in the production
deployment:

```text
CRON_SECRET=<random string at least 16 characters long>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role key>
MAINTENANCE_REQUESTER_ID=<UUID of the account that owns maintenance tickets>
```

`NEXT_PUBLIC_SUPABASE_URL` is already required by the application and is also
used by the keepalive endpoint. Never expose `SUPABASE_SERVICE_ROLE_KEY` as a
`NEXT_PUBLIC_` variable or commit it to the repository.

Vercel sends `CRON_SECRET` to the endpoint as a bearer token. To test a deployed
endpoint manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.example/api/cron/supabase-keepalive
```

A successful response includes `ticketCreated: false` when recent ticket
activity exists, or `ticketCreated: true` and the new ticket ID after five quiet
days. Any scheduler that can send the same authenticated daily GET request can
be used instead of Vercel Cron.
