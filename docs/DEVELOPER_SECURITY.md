# Developer panel and kill switch

Implemented November 13, 2026. The panel is available only to an active developer account through the security icon in the app header. Admins, operators and viewers cannot open its API or database operations. The ordinary Settings user management remains separate.

**Installation never freezes or wipes anything. All live-wipe activation flags default to off. No production wipe or real passkey enrollment was performed during implementation.** Independent backups were deferred by the owner, so the live wipe must remain disabled for now.

## Install the database update

When the panel reports that the update is not installed, it offers **Download SQL update** and **Open Supabase SQL Editor**. Download the file, open it in a text editor, paste the complete contents into a new query in the existing project and run it once. This single download installs the pending migration and records its history in one transaction, preserving existing data and leaving live wiping off. Return to the app and tap Refresh. Downloading requires the existing active developer login; it does not require the new security tables and cannot be used by other roles. A failed load displays recovery instructions instead of a permanent waiting message.

Open the local file `supabase/migrations/20261113090000_developer_security.sql`, copy its entire contents into a **new query** in the existing Supabase project's SQL Editor, and run it once. Local files do not appear automatically in SQL Editor. This is an additive migration; it preserves existing moulds, people, audit records and files.

Do not run the consolidated `supabase/schema.sql` on this existing project. If the versioned migration was applied manually, run `supabase/register_manual_developer_security.sql` afterward to record its history. The two earlier admin migrations have their separate registration script.

Set the server-only `DEVELOPER_APP_ORIGIN` to the exact HTTPS production origin (currently `https://mapel-job-tracker.vercel.app`). Preview deployments cannot administer production passkeys. Leave server-only `KILL_SWITCH_ENABLED=false`. Restart/redeploy after changing server environment variables. Never use `NEXT_PUBLIC_` for private settings.

## Owner setup

1. Sign in as the developer, open **Developer panel**, and choose **Set up authenticator**. Scan the private QR with a trusted authenticator app. Enter its current six-digit code. This uses no SMS service and no SMS charges.
2. Verify an authenticator code before sensitive setup. Verification lasts five minutes and is bound to that Supabase login session.
3. Name and register a passkey on one device, then repeat on a second device using the same production origin. Keep access to both. The server enforces two distinct credentials and verified signatures; WebAuthn cannot prove they are physically separate devices. Synced copies of one credential count once. Device verification can use fingerprint, face recognition or the secure device PIN. No biometric template leaves the device.
4. A failed submitted authenticator or passkey verification locks kill-switch setup and authorization for one hour and queues an owner email. Merely dismissing a native passkey prompt before submitting a response does not count as a failed signature. Reversible freeze/unfreeze remains available to the developer during a kill-switch lock.

Freeze denies other users live data through database policies, blocks creation of Auth accounts, and blocks registration. It does not terminate Supabase's password endpoint or erase copies on disconnected devices. When a wipe is running, database access is blocked for the developer too. Once a device reconnects and learns that wiping completed, it removes this app's cached reads, pending offline operations and persisted login token. Exported files and permanently disconnected devices cannot be remotely erased.

## Independent backup prerequisite (deferred)

Before arming anything, create an encrypted complete backup containing the app database, Auth data and all Storage files. Restore it successfully into an isolated project, then perform an end-to-end wipe-and-restore drill there, including real authenticator/passkey verification, scheduling and cancellation. Automated tests cover the logic but do not replace this real-device drill.

The app and worker must have **no delete authority** over the backup. For an external hard drive, use a separate backup machine/account and disconnect the drive before the wipe worker runs. A connected drive writable by the worker's OS account does not meet this requirement. Do not place backup credentials, encryption private keys or signing private keys in Vercel, this repository, or the worker environment.

Generate an Ed25519 signing key pair on the separate backup system. Copy only its public PEM to the worker. Start from `infra/backup-receipt.example.json` for the payload. Fill its actual backup and restore-test timestamps only after those operations succeed. The signer hashes the actual encrypted archive and signs the payload:

```powershell
node scripts/sign-backup-receipt.mjs payload.json private-key.pem encrypted-backup-file receipt.json
```

Signing does not perform a backup or a restore drill. It attests to the backup operator's completed checks. Keep the private key and backup outside the worker's reach. Import only the resulting signed receipt in the panel after verifying an authenticator code. Activation requires a backup less than 24 hours old and a restore test within 30 days. A scheduled wipe rechecks the latest valid receipt; stale backup proof prevents execution. Auth-phase recovery uses the signed original pre-wipe proof, because the database has already been cleared.

## Separate worker setup (leave disabled until the drill passes)

On the independent worker host, run this preparation command with the real backup public key:

```powershell
node scripts/prepare-kill-worker.mjs path-to-backup-public.pem
```

It creates ignored `.env.kill-worker.local`, `infra/backup-verification.local.pem` and `infra/kill-activation.local.sql`. Existing files are never overwritten. The worker secret is generated locally and never printed. Copy only the generated configuration SQL into Supabase SQL Editor; it saves the public key and worker-secret hash with wiping **still disabled**.

Fill the worker environment with the existing project's service role key and an SMTP account you already have. Set the exact project URL/ref, sender, recipient and SMTP TLS details. The worker needs the SMTP account to alert the owner; do not enable paid email services without approval. It has a durable private outbox, retries undelivered notices, and retains a minimal private execution receipt after the public audit log is wiped. Notices include request ID, UTC time and the initiating developer ID. Email delivery requires this worker to be connected; an offline worker leaves notices queued.

Inspection command (never executes a request):

```powershell
node --env-file=.env.kill-worker.local scripts/kill-worker.mjs
```

Only after the isolated drill, backup isolation and SMTP delivery test all succeed, deliberately enable all three: `KILL_SWITCH_ENABLED=true` in the web server, `wipe_enabled=true` in the private database control row, and `KILL_WORKER_ENABLED=true` in the independent worker. Then the independent worker can be run explicitly:

```powershell
node --env-file=.env.kill-worker.local scripts/kill-worker.mjs --execute --watch
```

The worker is never started by npm build/start, Vercel deployment or GitHub's existing workflows. A recent heartbeat and verified SMTP configuration are required before the UI can authorize a wipe. Keep database wipe disabled while starting the worker to establish its heartbeat and test notification delivery. No new hosted or paid service is provisioned by this implementation.

## Authorization and execution

The gateway lists the exact scope: live moulds, parts, BOMs, attachments, accounts including the developer, settings and public audit history. Verify a fresh authenticator code and a registered device passkey, type **DELETE**, then hold the button continuously for five seconds. Releasing, losing focus or going offline stops the UI hold. The server independently checks the elapsed hold time; it rejects early or expired confirmation. Authorizations/challenges are short-lived, session-bound and single-use.

Default execution is at the worker's next poll. The optional 24-hour delay creates a scheduled request instead. Cancel needs a new authenticator verification and passkey. Cancellation races are serialized with claiming; it cannot cancel once execution has begun. Removing a registered device is blocked while a request is pending.

The worker validates the pinned, signed backup receipt before claiming a request. Claiming freezes the system. It removes live Storage objects and buckets, truncates public application tables together, deletes Auth users, then marks completion only if Auth and Storage are empty. Database truncation deliberately has no CASCADE: unexpected dependencies cause rollback. A secret worker key plus expiring execution lease protects checkpoints. Failed execution stays frozen; after the lease expires, restart the same independently configured worker to resume the last durable phase. Never unfreeze a partially wiped system.

The worker never contacts a backup destination. Its separate configuration must also prevent filesystem or credential access to that destination. A minimal private execution snapshot/outbox survives to support recovery and email retries; the full public app audit history does not.

## Restore and verification limits

Restoration is an operator-run backup procedure, not a one-click restore button. Restore to an isolated fresh project first, verify Auth and Storage as well as rows, rotate exposed credentials, and deliberately reset private freeze/wipe/execution flags before reopening the restored app. Re-establish trusted origins, backup verification and passkeys as needed.

Automated tests use a disposable in-memory PostgreSQL instance and injected fake Storage/Auth clients. They exercise actual WebAuthn signatures, roles, freeze, replay protection, server hold timing, delayed requests, cancellation, worker phases, pagination and failed deletion. They never use production credentials or contact the production project. Mobile screenshots use a mock panel, not live authorization. A real two-device biometric/authenticator drill, external backup isolation, restore verification and SMTP delivery remain required before live activation.
