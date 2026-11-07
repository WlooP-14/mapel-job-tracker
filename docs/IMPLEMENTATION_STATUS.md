# Screen-by-screen implementation ledger

## Audit — 4 November 2026

- Existing Next/React/Supabase app retained. No reset, deletion, new project or rebuild from scratch.
- Eleven migrations are deployed to the same Mapel Project `emrjfelkxbegkvyxszba`. All 24 tables use RLS, with 23 audit triggers. API-assigned versions are recorded in migration filenames. Existing owner settings and history were preserved.
- Interrupted local NewMould, MouldWorkspace, MouldDetail, AddPart and RPC tests were preserved and extended. Hosted operator sign-in, mould creation and manual part creation now work.
- Interrupted builds and tests completed before the interruption. Local server responds HTTP 200. Fresh baseline: 19 tests pass.
- Existing credentials remain in gitignored env files. Existing operational rows, audit history and user stage-duration settings are retained.
- Design sources are the 36 fetched Stitch screenshots / 35 HTML references under `design/stitch/`, with final-plan rules overriding conflicts.

## Acceptance order

Each row requires layout, role controls, real data, loading/error/empty states and mobile checks. Evidence and known gaps are recorded before advancing.

| Order | Screens | Status |
| --- | --- | --- |
| 1 | Login and shared navigation | Aligned; live phone/PIN operator sign-in and 390px layout checked; no SMS |
| 1 | Help / first-run tour | Aligned; first-run, skip, back/next and replay checked |
| 1 | Settings (profile; admin-only sections) | Aligned; hosted settings read, role visibility, language persistence and holiday save/archive/Undo checked. Full export downloaded and parsed (23 sheets before the Trials migration); a final 24-table export check follows. Handover buffer and T0 lead settings are editable without resetting stage durations. PIN change is implemented but credentials were not changed during QA. |
| 2 | Mould list | Reusable bordered cards connected to jobs/customers/readiness; mobile live empty/populated states checked |
| 2 | Create mould | Live operator save verified; date-input event defect fixed; duplicate/rollback/role checks in database tests |
| 2 | Mould detail + four categories | Aligned; all four tabs, live operator create/add, viewer read-only UI and hosted denial of writes checked. Trial/priority edit and reasons/history checked live. |
| 3 | BOM review | Live Excel → four-section review → private source upload → save verified. Local draft recovery and explicit revision verified: five parts retained, revision advanced to 6. Exported Excel file opened and parsed successfully. Photo/PDF originals support manual transcription; automatic vision extraction is unconfigured. Print/PDF control is implemented but output has not been checked. |
| 3 | Receiving | Deployed and connected; partial receipt, remaining quantity, Undo, wrong receipt/correction and Hardware Receive → Verify → Issue checked live on mobile. Viewer has no edits, and hosted RPC writes are denied. Database tests include excess, retry safety and correction history. |
| 3 | Planning / allotment / work | Deployed; material selection, configured routes, inline vendor creation, actual sent date and saved deadlines checked live. Two-part outsourced batch completed via bulk start, partial returns and final returns (6/6). Allotment Undo restored prior state. In-house base/child batches completed through the operator API using the same routines. Hardware excluded in UI and SQL. Viewer has no checkboxes/edit actions. English/Hindi/Marathi fit the 390px test frame. |
| 3 | Assembly / Trials | Deployed; 5/5 ready parts → assembly → T0 correction with selected part/private image → correction Done → T1 pass → explicit T2 Not needed → Finished → Reopen with reason checked live as operator. Viewer has no write controls. Evidence downloaded by viewer matches the fixture hash. English/Hindi/Marathi fit the mobile frame. Database tests reject stale assembly, missing outcomes, unresolved corrections, no retest, direct terminal-state bypass, closed-mould physical edits and viewer writes. |

The externally isolated backup destination and restore drill remain unconfigured; no backup-success claim or functional restore button will be fabricated. Paid services require explicit approval.

## Verification notes

- Existing stage durations were loaded unchanged (including the user's 4/4/5 turn-stage settings).
- Hindi and Marathi profile screens fit 390px without page overflow; language preference persists after reload.
- A stale development service worker was serving old assets. Local-only refresh now clears only this app's shell caches, retaining Auth and local preferences. Production caching is limited to immutable assets.
- QA operator/viewer accounts and mould codes prefixed `QA-MOBILE-` are isolated test fixtures. Their credentials are gitignored. Test records will be soft-archived, with audit history preserved.
- Screenshots: `docs/qa/login-aligned-390.png`, `settings-aligned-390.png`, `new-mould-aligned-390.png`, `mould-detail-aligned-390.png`.
- Stitch-only customer dispatch fields, sample facility data, purchasing cards and coloured surfaces are deliberately omitted because the final plan takes precedence.
- A manual Excel export is not an independent backup and does not include original Storage file bytes.
- Current automated check: 28 tests pass and the production build passes. Hosted role checks are recorded in `docs/live-workflow-verification.json` before QA archival. All 24 tables have RLS; the only security advisory is the pre-existing leaked-password-protection warning. No paid upgrade was enabled. Seventeen browser assets were checked against three actual local private credentials; none were exposed.
- Actual downloaded BOM: four worksheets, five parts, preserved round size `ϕ44x233` and hardware quantity 6. This verifies an artifact, not merely a success message.
- Unstarted target dates shift in working days when T0 changes. Work already started keeps its actual vendor deadline. Both previous values and the change reason are retained.
- Revisions cannot change quantity after processing/allotment or hardware issue begins; extra units should be a new row. This avoids treating new units as already processed.
- The native database stage-alert job is active at 01:00 India time. Manual execution succeeded and is recorded in `docs/delay-engine-verification.json`; the first scheduled execution has not occurred yet. This is not the independent backup job.
- Trials require T0. T1/T2 can be explicitly Not needed after a pass, with a recorded reason. A later correction requires another passing trial. These workflow choices are visible in the screen introduction.
- New mobile evidence: `planning-work-390.png`, `planning-viewer-390.png`, `trials-viewer-390.png`, `trials-results-390.png` under ignored `docs/qa/`. This is responsive browser testing, not physical Android/iOS device testing.

## Remaining work and external dependencies

- Independent encrypted backups, Storage-byte backups, destination retention and a successful restore drill require the separate storage destination and credentials; no backup is active.
- Automatic image/PDF BOM reading is unconfigured. Manual attached-original transcription and direct Excel import work without AI charges.
- General offline write queuing/conflict review is not implemented. BOM review drafts survive reload locally.
- Print/save-PDF controls exist, but PDF output and physical-device/PWA installation still need acceptance checks.
- Mould box labels and scan confirmation are implemented. A live mould was found by code in the browser and a three-label sheet rendered. Automated QR generation and decoding passed. Camera and print/PDF still need a physical-device and label-paper check.
- Developer kill-switch UI remains outside the implemented screen sequence. Its fetched Stitch design is a reference.
