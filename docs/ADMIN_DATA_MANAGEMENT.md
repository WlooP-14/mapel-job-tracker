# Admin data management

Admins and developers can open **Manage data** in Settings for the app, or on a mould for that mould only. Operators and viewers have no access to these administrative RPCs or controls. Existing shop-floor correction and Undo actions remain available under their original permissions.

Choose a record type, filter by mould if relevant, and search. Edit the supported business fields, give a reason and save. Delete requires a reason and confirmation; deleting an entire mould also requires typing its exact code. The Deleted records view offers Restore. Restore the mould before restoring its individual records. Restored team accounts remain inactive until deliberately approved. An administrator cannot remove their own access or change the protected owner account here.

The supported categories are moulds, BOM parts and files, work batches, part processes, receipts, work returns, assembly/trial/correction events, remarks and alerts, vendors, customers, holidays, process templates, material routes, team accounts and app settings. The forms show business fields rather than a raw SQL or JSON editor. Authentication phone numbers/PINs, immutable audit records, original Storage objects, revision snapshots and security credentials are outside this editor. Derived totals are corrected through their source receipts and work returns.

## Retention and correctness

- Delete is a recoverable removal. A mould is hidden as one unit by archiving its parent. Its child records and files remain available for restoration. No hard-delete or Storage-delete permission is added.
- Removing a BOM source hides every file entry for that source on the mould. Already imported parts remain unless separately removed. Removing a part hides its active batch membership. Removing a batch archives its active process rows and resets its parts to pending default processes; restoring it is blocked after new work is allotted to those parts.
- Work returns and receipts update their derived totals when corrected or removed. Changes that would reduce receipts below already allotted requirements, or invalidate a later started process, are rejected. Remove/correct dependent false work first. Reopen a finished mould through Trials before modifying its parts or work. Hardware checks and finish/reopen/void events use their dedicated workflow.
- Updates to business event records are possible only through the role-checked administrative definer function, with a recorded reason. Every before/after value is retained by the audit trigger. Audit records themselves, BOM revision snapshots and date history remain immutable. Each edit also compares a version hash to reject stale forms.
- Removed returns and trial events no longer contribute to current status. Removed remarks and removed moulds are excluded from the working remarks/alerts view. Deleted entries remain visible in the administrative recovery view while the parent mould is available.

## Activation

Apply pending migration `20261112160000_admin_data_management.sql` to the existing project using the configured migration workflow. It follows the configurable-process migration, which must also be applied if pending. Do not run the fresh-project schema installer against the hosted database.

The user applied SQL manually in Supabase SQL Editor. The live admin list/edit/delete/restore flow was then verified on one isolated on-hold QA mould, which was left deleted. The QA account's temporary admin role/access was restored to its original values. No real mould or team records were removed.

Run [register_manual_admin_migrations.sql](../supabase/register_manual_admin_migrations.sql) in SQL Editor once to register the two manually applied migrations. Its preflight checks stop if the final schema is missing or history conflicts. This changes migration bookkeeping only. Future CLI deployments must use aligned migration history rather than replaying the manual SQL.

GitHub currently has no `SUPABASE_DB_URL` secret. Until it is configured, the workflow reports that automatic database deployment is skipped. It continues to run tests. The user may later add the secret as described in [DATABASE_DEPLOYMENT.md](DATABASE_DEPLOYMENT.md), after registering manual history.
