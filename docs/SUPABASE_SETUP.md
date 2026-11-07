# Supabase setup for Mould Job Tracker

## Current project — already configured
Mapel Project (`emrjfelkxbegkvyxszba`) is configured through the Management API. Do not repeat project creation or bootstrap steps for this project. Phone + PIN sign-in is selected to avoid SMS charges; the app does not request OTPs or send messages. Use the initial PIN in `.env.account.local` and change it from Settings after first sign-in. Supabase stores the PIN as a password hash. The remaining sections describe alternative/fresh-project setup paths; SMS sections apply only if switching to OTP later.

Eleven migrations, RLS on all 24 tables, 23 audit triggers, private Storage, PIN sign-in and the operational screens through Trials have been verified. The production build and 28 local tests pass. The database stage-alert checker is scheduled and manually verified; it is separate from backups. External backups remain unconfigured. Supabase reports leaked-password protection is not enabled; no paid upgrade was enabled. The remaining setup instructions apply to fresh projects or explicitly changing this installation.

## 1. Create the project
Open https://supabase.com/dashboard and create a project called **Mould Job Tracker** in your own organization. Choose a nearby region available in your account. Save the database password in your password manager. Begin with test data; the live backup and restore drill are separate launch requirements.

Use a new, empty project for these migrations. The app is not connected until the following steps are completed.

## 2. Apply the migrations
In a terminal opened in this repository, run:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REFERENCE
npx supabase db push --dry-run
npx supabase db push
```

The project reference is the identifier in your dashboard project URL. Enter the database password if requested. The CLI tracks applied migrations, so use it consistently. Do not paste the files into SQL Editor as well. Do not use `db reset` against the hosted database.

This creates the schema, role policies, immutable audit history and the private `bom-sources` bucket. Storage originals cannot be overwritten or deleted through the application.

## 3. Connect the browser app
Copy `.env.example` to `.env.local`. In the Supabase **Connect** dialog or **Settings → API Keys**, copy your project URL and **publishable** key:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REFERENCE.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

A legacy anon key can instead be placed in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put a secret key, service-role key or database password in a `NEXT_PUBLIC_` variable. Restart `npm run dev` after changing these values.

## 4. Enable phone OTP
In **Authentication → Sign In / Providers**, enable Phone and configure a supported SMS provider. Under Auth URL configuration set Site URL to `http://localhost:3000` during development, and the final HTTPS site address before rollout.

For an initial test, configure a test phone number and fixed OTP in Supabase's test-phone settings. Follow the current dashboard instructions for enabling the Phone provider and SMS provider first. Use the country code consistently (for India, `+91` followed by the mobile number in the app). Remove test-number overrides before production. Real SMS delivery needs your provider credentials and any required sender/template registration.

The app only signs in existing accounts; it does not create users at sign-in.

## 5. Create your first developer account
On your own trusted computer create `.env.admin.local` with:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REFERENCE.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_OR_SERVICE_ROLE_KEY
DEVELOPER_PHONE=+91YOUR_MOBILE_NUMBER
DEVELOPER_NAME="Your name"
```

Run:

```powershell
node --env-file=.env.admin.local scripts/bootstrap-developer.mjs
```

The script creates or reuses the phone Auth account and inserts its developer profile. It stops if a developer already exists. It confirms the provisioned phone account; login still requires OTP. This file is gitignored. Remove the local secret file when finished. Never paste the secret key into chat or frontend code.

Log into the app with that phone and your test OTP or received SMS code. Before testing other roles, provision their Auth accounts using a trusted administrative process, then add matching `public.users` profiles with role `admin`, `operator`, or `viewer`. The full user-management screen is not implemented yet.

## 6. Verify the connection
Run `npm run dev`, open http://localhost:3000 and sign in. Verify language selection, first-run tour and Settings. Stage-day editing is available to admins and developers; other users see profile/language only. Leave Squaring and Machining blank until agreed. No production BOM data is required to verify Phase 1.

Local automated checks: `npm test` and `npm run build`. PostgreSQL tests emulate Supabase Auth/Storage schemas with PGlite; also verify policies against the hosted project before launch.

## 7. Backups and extraction
The external backup workflow is configured in `.github/workflows/nightly-backup.yml`. To activate it, host the repository on GitHub and configure its backup secrets, a PostgreSQL read-only backup account, a separate S3 account with append-only upload permissions, Object Lock and independently managed retention. See README and `infra/backup-uploader-policy.json`. A successful restore drill is required before real production data. Database dumps alone do not include Storage file bytes; those need their own backup. The job has not run yet.

BOM extraction can wait until the BOM phase. To enable the provided adapter then, set Edge Function secrets `GEMINI_API_KEY` and `BOM_GEMINI_MODEL` and deploy `extract-bom`; never put the model key in the browser. Authenticated extraction returns draft data for review, not saved rows.

## Official references
- API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Phone authentication: https://supabase.com/docs/guides/auth/phone-login
- Test phone numbers: https://supabase.com/docs/guides/auth/testing-auth-flows
- Migrations: https://supabase.com/docs/guides/local-development/database-migrations

## Direct Management API setup (alternative to CLI login)
A public project API key cannot apply SQL migrations. Use a short-lived personal access token from https://supabase.com/dashboard/account/tokens and scope it to `emrjfelkxbegkvyxszba` only. Grant Project Settings (Read), Database (Read), Migrations (Read-write), and API Keys (Read). Save the token in the gitignored `.env.setup.local` as `SUPABASE_ACCESS_TOKEN`; set `SUPABASE_PROJECT_REF` alongside it. Do not put the token in chat or any `NEXT_PUBLIC_` variable.

Preview and apply:

```powershell
node --env-file=.env.setup.local scripts/setup-supabase-api.mjs
node --env-file=.env.setup.local scripts/setup-supabase-api.mjs --apply
```

The script checks project identity and existing tables/history, applies pending migrations through the Management API, verifies RLS, aligns local migration filenames with API-assigned versions, and writes only the publishable key and project URL into `.env.local`. It refuses projects with unfamiliar migration history or existing untracked public tables. It does not create projects, disable RLS, configure SMS credentials, provision users, or activate external backups. Avoid simultaneous migration runs; inspect the dashboard after any ambiguous network failure. Revoke the temporary token after setup. The API script is tested with mocked HTTP responses; hosted verification is pending until a token is supplied.

References: https://supabase.com/docs/guides/platform/personal-access-tokens and https://supabase.com/docs/reference/api/v1-apply-a-migration
