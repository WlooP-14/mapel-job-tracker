# Mould Job Tracker

## Automatic database deployment

See [the one-time database deployment setup](docs/DATABASE_DEPLOYMENT.md). Store the project's Session pooler connection as the GitHub Actions secret `SUPABASE_DB_URL`. The database migration workflow can then deploy pending migrations without a personal Supabase access token. Activation is pending until that secret is saved and a successful run is verified.

## Docker hosting

With Docker and the Compose plugin installed, run `docker compose --env-file .env.local up --build -d` from the project folder. The app is available at `http://localhost:3000`. On a fresh host, copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable key first. Set `APP_PORT` in `.env.local` if port 3000 is already in use.

For public hosting, point an HTTPS reverse proxy at port 3000 on the host, or let your container hosting platform route HTTPS to port 3000 in the container. HTTPS enables PWA installation and camera scanning on users’ phones. The app connects to the existing Supabase backend for sign-in, data and file storage.

On platforms that build from a Dockerfile, pass `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as build arguments. A legacy anon key can be supplied as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Rebuild the image when changing Supabase projects. Set `SUPABASE_SERVICE_ROLE_KEY` as a runtime secret only if administrators need to create team accounts from the hosted app.

## Current hosted setup

Connected through the Management API to the existing Mapel Project (`emrjfelkxbegkvyxszba`). Eleven migrations are applied. All 24 public tables use RLS; 23 operational/configuration tables have audit triggers, and the audit log is immutable. Private source/evidence Storage and phone + PIN sign-in are verified. Server credentials stay in ignored local files. No SMS or paid service was enabled. Independent backups are not active.

## Run
Install Node.js and run `npm install`, copy `.env.example` to `.env.local`, set the Supabase URL and publishable key, and run `npm run dev`. Run `npm test` for scheduling and PostgreSQL migration/RLS tests (PGlite emulates the Supabase auth and storage schemas) and `npm run build` for a production build.

Apply `supabase/migrations` to a new Supabase project with the Supabase CLI. The configured project uses phone + PIN sign-in without SMS. Create the first developer using a trusted SQL administration session after creating an Auth user: `insert into public.users(id,name,role) values ('AUTH-USER-UUID','Name','developer');`. Add each other Auth user to `public.users`; an Auth account without an active profile has no access. Never expose a service role key to the browser. The mobile number must be in international format.

The schema enforces roles, immutable history, audit triggers and no hard deletes. Admin/developer Settings provisions personal accounts through a server-only Auth endpoint. Readiness counts unplanned parts as waiting and excludes parts whose steps are all not applicable. Hardware uses Received → Verified → Issued, without allotment. Bulk work uses actual sent dates, configured routes/durations, partial returns and retained history. Assembly and trial gates protect Finished/Reopen in the database. Physical BOM/work changes invalidate earlier assembly. Restrict database-owner credentials, which can bypass application security.

## Backups require a destination
Backup activation is deferred until the developer supplies an external hard drive. The local workflow draft schedules daily encrypted database and attachment copies at 02:00 India time and weekly copies on Sunday at 03:00. It currently targets independent cloud buckets and needs adapting for the selected office drive. No destination, scheduler, or restore drill has been activated. Backup credentials belong to a separate process on the backup computer and must remain outside the app. The live app must have no delete permission on the backup drive.

## Scope and decisions
The existing app follows fetched Stitch references, with the final plan taking precedence. Login, navigation, Help/tour, Settings, mould list/create/detail, four BOM categories, Excel review, Receiving, bulk Planning/allotment, in-house/vendor work and Assembly/Trials are connected to Supabase. Live QA covers partial receipts/returns, corrections, private evidence, Finish and Reopen. The nightly stage-alert checker runs in Supabase at 01:00 India time; its schedule and a manual execution are verified, while the first scheduled run has not yet occurred. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for evidence and remaining gaps. The production build and 28 tests pass.

The PWA has an install manifest and a cached navigation shell. Local BOM drafts and user-separated read caching are implemented. Previously opened moulds, Receiving and Planning pages can be read offline. New receipts, work returns and allotments are queued on the device with their original request identifiers and sync under the same user when the app is online. Rejected changes stay in a review list. Receipt corrections, Undo, hardware verification, work starts, trials and Settings changes still require a connection. Keep the app open on reconnect to finish syncing. Automatic photo/PDF extraction is unconfigured; manual transcription can retain the original file without AI charges. External backups and a restore drill are not active. No purchasing or gate-pass features are included.

An example uploader identity policy is in `infra/backup-uploader-policy.json`; replace the bucket placeholder. Attach it only to a dedicated identity in the backup account. Object Lock and retention are destination-side settings managed by a separate administrator. The application must have no credentials for that account. The example is not a substitute for bucket-policy review and a restore drill.

## Supabase walkthrough
See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for project creation, migrations, public keys, phone OTP, first-developer provisioning and backup activation. The first-developer helper uses server-only credentials on your trusted computer. The current developer is already provisioned. Settings now includes profile/language for all roles and stage-duration editing for admins/developers.

## Database schema artifact
The consolidated fresh-project SQL is [supabase/schema.sql](supabase/schema.sql). The [schema guide](docs/SUPABASE_SCHEMA.md) includes the table dictionary, access matrix and relationship diagram. The existing hosted project already has its source migrations; do not rerun the fresh-project installer there. Regenerate it with `npm run schema:build` after migration changes.
