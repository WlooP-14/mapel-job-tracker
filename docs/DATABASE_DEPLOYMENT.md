# Lasting database deployment setup

The app stays on the existing Supabase project `emrjfelkxbegkvyxszba`. Vercel deploys the frontend from GitHub. The `Deploy database migrations` GitHub workflow applies new SQL migrations on main using one database connection secret, without a personal Supabase API token. The connection password remains valid until changed; update the secret whenever rotating that password. This does not provision a paid service. GitHub Actions remains subject to your account's included usage limits.

## Save the connection once

1. Open the existing project at https://supabase.com/dashboard/project/emrjfelkxbegkvyxszba and select **Connect**.
2. Choose **Session pooler**, URI format, port **5432**. Copy the connection string. Keep the host supplied by Supabase; do not guess it from the region. Replace `[YOUR-PASSWORD]` with your existing database password, URL-encoding password special characters. This is the database password, separate from the app PIN and API keys. If you do not know it, check your password manager before considering a database password reset.
3. Open https://github.com/WlooP-14/mapel-job-tracker/settings/secrets/actions and select **New repository secret**. Name it **SUPABASE_DB_URL** and paste the complete connection string into its value. Save it privately. Do not put it in chat, source files, Vercel frontend variables or any `NEXT_PUBLIC_` setting.
4. Open the repository's **Actions → Deploy database migrations → Run workflow** on **main**. First leave **Apply pending migrations** unchecked for a connection/history preview. After that succeeds, run again with that box checked to apply the pending process migration.

Subsequent pushes to main containing migrations apply them automatically after tests and a dry-run. GitHub lists the run result. Do not enable Actions billing overages for this setup. Vercel and the database deploy independently; wait for the database job to succeed before testing a new feature that requires schema changes.

The deployment script checks that the URL names this existing project, enforces TLS, and runs only pending migrations. It does not reset the database, repair history, seed data or push Auth/Vault configuration. Existing migration history mismatches cause a failure for review. CLI diagnostics are withheld to keep connection secrets out of logs. A failed migration may leave earlier migrations in the same batch applied; inspect history before retrying.

## Optional local deployment

For this computer to deploy without GitHub, put the same `SUPABASE_DB_URL` in the ignored `.env.setup.local` file, keeping any existing settings. Then run from the project folder:

```powershell
node --env-file=.env.setup.local scripts/deploy-database.mjs
node --env-file=.env.setup.local scripts/deploy-database.mjs --apply
```

The first command previews; the second applies. No Supabase personal access token or CLI login is needed for these database commands. Managing Auth providers, project settings or Edge Function deployments remains a separate administrative task.
