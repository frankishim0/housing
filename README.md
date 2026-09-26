# Nigerian Homes

Database-backed Nigerian property marketplace built with Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set the required values:

   - `DATABASE_URL` — required for every database-backed page, API route, Prisma command, and seed.
   - `AUTH_SECRET` — required application secret for production security configuration.

   The payment, cloud storage, and map variables are optional for local startup. Their related features fail explicitly until configured.

3. Create/update the database schema and generate the client:

   ```bash
   npm run db:push
   npm run db:generate
   ```

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

- PostgreSQL/Prisma models, relations, indexes, enums, and seed data.
- Password-hashed registration and login with HTTP-only database sessions.
- User, owner, agent, and admin role checks.
- Database property listing, filtering, sorting, and pagination.
- Owner/agent property creation, update, delete, publish, and pause endpoints.
- Persisted favorites and saved-properties dashboard.
- Persisted enquiries and owner/agent enquiry visibility.
- Persisted viewing requests with conflict checks and status management.
- Private conversations and messages restricted to participants.
- Payment initialization/verification abstraction for Paystack.
- Admin listing moderation and platform summary endpoints.

## Required external configuration

- `DATABASE_URL`: PostgreSQL connection string.
- `AUTH_SECRET`: long random application secret.
- `APP_URL`: public HTTPS URL used in password-reset links.
- `RESEND_API_KEY`: Resend API key used to send password-reset emails.
- Password-reset emails use Resend's sandbox sender, `onboarding@resend.dev`.
- `PAYSTACK_SECRET_KEY`: required for real Paystack payments.
- `FLUTTERWAVE_SECRET_KEY`: reserved for a future Flutterwave provider.
- Cloud storage credentials: required before production media uploads.
- `NEXT_PUBLIC_MAP_API_KEY`: required before map search is enabled.

Payment routes fail explicitly when credentials are not configured; they do not report fake successful transactions.

## Verification commands

```bash
npm run typecheck
npm run lint
npm run build
```

<!-- README update to trigger a Git commit. -->
