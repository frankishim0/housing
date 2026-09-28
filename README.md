# Homes Worldwide

Global real-estate marketplace built with Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set the required values:

   - `DATABASE_URL` — required for every database-backed page, API route, Prisma command, and seed.
   - `AUTH_SECRET` — required application secret for production security configuration.

   The payment, cloud storage, and map variables are optional for local startup. Their related features fail explicitly until configured.

3. Create/update the Prisma schema and generate the client for a fresh local database:

   ```bash
   npm run db:push
   npm run db:generate
   ```

   For an existing database with the earlier marketplace schema, apply `prisma/migrations/20260926180000_global_marketplace/migration.sql` before running `db:push`; it adds global fields without deleting records, seeds ISO currencies, and links existing Nigerian locations/profiles to `NG` → region → city. If the database has an established Prisma migration baseline, `npx prisma migrate deploy` applies it. Fresh databases should use `db:push` and must not run this backfill migration.

4. Seed development data:

   ```bash
   npm run db:seed
   ```

   Seed credentials:

   - `owner@example.com` / `Password123!`
   - `admin@example.com` / `Password123!`

5. Start the application:

   ```bash
   npm run dev
   ```

## Implemented server-backed flows

- PostgreSQL/Prisma global country, region, city, currency, property type, listing, and user preference models with indexed relations and legacy-data backfills.
- Password-hashed registration and login with HTTP-only database sessions.
- User, owner, agent, and admin role checks.
- Database property listing, filtering, sorting, and pagination.
- Owner/agent property creation, update, delete, publish, and pause endpoints.
- Persisted favorites and saved-properties dashboard.
- Persisted enquiries and owner/agent enquiry visibility.
- Persisted viewing requests with conflict checks and status management.
- Property-linked buyer, owner, and agent conversations with live polling, presence, unread counts, replies, attachments, read receipts, and participant-only access.
- Server-filtered global search, opt-in nearby discovery, OpenStreetMap maps, worldwide geocoding and directions, localized currency/unit/date formatting, original-currency listing prices, user-selected display currencies, and cached approximate exchange-rate conversion with a provider fallback.
- Server-calculated, original-currency transaction quotes with country/type/currency-specific percentage and fixed commissions, buyer fee previews, processing-fee estimates, seller proceeds, payout snapshots, refund/dispute records, printable receipts, and audit-logged admin configuration.
- Admin-managed subscription, featured-listing, and qualified-lead product pricing; subscription listing limits are enforced for active plans. Subscription and promotion actions create pending order intents only.
- Paystack test payments initialize from server-stored transaction quotes or monetization order snapshots. The API rejects client-supplied financial overrides, and settlement requires server-to-server Paystack verification or a signed webhook followed by Paystack verification.
- Paystack webhook deliveries are durably deduplicated. Failed and abandoned payments do not activate transactions, subscriptions, or featured listings. Live keys, refunds, and payouts remain disabled.
- Admin listing moderation and platform summary endpoints.

## Monetization and payment readiness

- The admin dashboard configures commission rules and product prices. Add the intended Free, Pro, and Business plans and featured-listing durations/prices there; no plans or commission rates are seeded.
- Commission rules match transaction type, country, property type, and currency. More-specific matches take precedence. Transaction amounts and all fee/payout totals are calculated on the server and snapshotted in the original listing currency.
- Buyers can request an informational fee quote from a property page. Owner/agent dashboards show financial history and payout state; receipts are printable only for a server-recorded paid transaction.
- Transaction and monetization payments use the provider-neutral payment interface. Paystack is currently registered for NGN, GHS, KES, ZAR, XOF, and USD; availability also depends on Paystack account-country support. Other marketplace currencies remain browseable and quoteable, but payment initialization is rejected until another provider is configured.
- Configure Paystack test-mode `PAYSTACK_SECRET_KEY` (`sk_test_...`) and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` (`pk_test_...`), `PAYSTACK_WEBHOOK_SECRET`, and `APP_URL`. Paystack signs webhooks with its API secret key, so `PAYSTACK_WEBHOOK_SECRET` must contain the same Paystack test secret. Do not configure live keys.
- The existing physical webhook-event table was created by a prior Stripe migration; Prisma now maps it to a provider-neutral payment webhook model. This preserves existing rows and requires no schema migration.
- Qualified-lead products can be configured, but lead orders are intentionally unavailable until an explicit consent and qualification workflow is configured. This avoids selling existing enquiries or exposing personal data without permission.

## Required external configuration

- `DATABASE_URL`: PostgreSQL connection string.
- `AUTH_SECRET`: long random application secret.
- `APP_URL`: public HTTPS URL used in password-reset links.
- `RESEND_API_KEY`: Resend API key used to send password-reset emails.
- `EMAIL_FROM`: sender address verified with Resend for the production domain.
- `PAYSTACK_SECRET_KEY`: required on the server for test transaction initialization and verification; must begin with `sk_test_`. Live keys are rejected.
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`: required test-mode public key; must begin with `pk_test_`. Hosted Paystack authorization redirects do not expose or require the secret key in the browser.
- `PAYSTACK_WEBHOOK_SECRET`: required to verify `x-paystack-signature` on `/api/webhooks/paystack`; due to Paystack's signing protocol, configure it to the same value as the Paystack test secret key.
- `APP_URL`: required for the Paystack callback URL; use the application’s HTTPS origin in production.
- `PROPERTY_IMAGE_HOSTS`: comma-separated HTTPS CDN/image hosts allowed by Next Image (defaults to Unsplash plus Cloudinary).
- `FLUTTERWAVE_SECRET_KEY`: reserved for a future Flutterwave provider.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`: signed image, video, document, and messaging attachment uploads.
- Maps, geocoding, listing-location selection, and driving/walking/cycling directions use OpenStreetMap-based services by default and require no API key or paid account. Public [OpenStreetMap tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim geocoding](https://operations.osmfoundation.org/policies/nominatim/) services are community-operated and subject to fair-use limits; geocoding is explicit-search only, not autocomplete.
- Optional Mapbox provider: set `NEXT_PUBLIC_MAP_PROVIDER=mapbox` and configure `MAPBOX_ACCESS_TOKEN` plus `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. Restrict the public token to the deployed domains.
- `ABLY_API_KEY`: server-side Ably key for authenticated real-time messaging, presence, and notifications.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`: LiveKit rooms for secure calls and live property tours.
- Currency conversion requires no API credential: the app caches rates for six hours, uses Open ER API first and Frankfurter as a fallback, and continues showing original listing prices if both providers are unavailable. Price ranges and sorting are explicitly scoped to a selected original listing currency; display conversion never changes stored listing prices.

Paystack return redirects do not mark purchases paid by themselves: the app calls Paystack's verification API and reconciles the verified amount/currency, while signed webhook notifications are also verified against Paystack before settlement. A provider-specific transaction reference and webhook event are stored, and status changes plus audit records are written transactionally. Refunds, automatic subscription renewals, and payouts remain disabled.

For local testing, configure a Paystack test-mode webhook forwarding charge events to `/api/webhooks/paystack`. Use only test keys; the server rejects live secret/public key prefixes.

## Verification commands

```bash
npm run test:monetization
npx prisma validate
npm run typecheck
npm run lint
npm run build
```

<!-- README update to trigger a Git commit. -->
