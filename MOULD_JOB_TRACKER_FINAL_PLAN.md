# Mould Job Tracker: Final Project Plan
**From material received to trials done. Scope, design, architecture and build guide.**

This is the single, final document. It replaces all earlier versions of the plan.

**Contents**
1. Purpose and scope
2. Users and roles
3. Workflow
4. Features (Version 1 and Version 2)
5. Business rules
6. BOM from image (the BOM sheet as the template)
7. UI design rules and screen list
8. Architecture and data model
9. Data safety, backups and the kill switch
10. Build plan
11. Testing and rollout checklist
12. Decisions made, assumptions and open points
13. Starter prompt for a coding assistant
14. Appendix: Stitch design brief

---

## 1. Purpose and scope

Today the team writes updates on paper, then types the same data into Excel. That is double work, it is slow, and data gets lost or goes stale.

**Goal:** one mobile-friendly web app where each update is entered **once**, by **one tap**, where the work happens. Everything else (dates, delays, criticality, alerts, reports, backups) is automatic.

### What the app covers
- **Starts** when the company **receives raw material** against a BOM.
- **Ends** when the mould's **parts, jobs and trials are done** (the mould is marked **Finished**).
- Only the **mechanical side**: receiving and checking material, planning in-house or outsourced work, vendor job work (turning, hardening, grinding), in-house machining, assembly and trials.

### What it does not cover
- **No purchasing.** The app is not used by the purchase department: no purchase orders, no order status, no material supplier delivery tracking.
- **No customer dispatch** of the finished mould for now.
- In this document, "dispatch" only means **sending material to job-work vendors**.

### Success looks like
- Paper is no longer needed for updates.
- A new person can use it in 5 minutes with no training.
- No data is ever lost, and any mistake can be undone.
- A manager can open one screen and see which moulds are in trouble.

---

## 2. Users and roles

Everyone has their own smartphone. Login is **mobile number + OTP, or a simple PIN**, which is easier for older users than email and password. Every change is logged with the person's name, whatever the role.

| Role | Who | Can do |
|---|---|---|
| **Developer** (super admin) | The owner/developer only (1 or 2 accounts) | Everything an Admin can do, plus the **Developer panel**: system freeze, **kill switch**, restore from backup, full audit log, create and remove Admins. The Developer account is **hidden** from the Users list and cannot be edited or removed by anyone else. |
| **Admin** | Trusted managers | **Every other authority**: users (Operators and Viewers), settings, stage days, material routes, holidays, backup and export, all moulds. **No kill switch and no Developer panel.** |
| **Operator** | The project manager team | Create and edit moulds, BOMs, receiving, planning and allotment, in-house work, trials, remarks and statuses. Keep every mould up to date. No access to Settings sections for admins, or to users. |
| **Viewer** | People who only follow progress | **Read-only**: Dashboard, Moulds, mould pages, Overview and Alerts. Can view and share a BOM. No edit buttons are shown at all. |

- Roles decide which screens and buttons appear, and are **also enforced in the database** (row-level security), not just hidden in the app.
- **One shared live page per mould.** Everyone working on mould 1420 opens the same page on their own phone and can work at the same time on different parts (for example one person on Turn Parts, another on Child Parts). Every change appears on all phones within a second or two.

---

## 3. Workflow

```
BOM available (from the design team's Excel or a photo)
      |
      v
Raw material arrives  ----> START of the app
      |
      v
Receiving: check quantity of every item against the BOM
      |  (mismatch -> short / excess / wrong, raise a flag)
      v
Planning: select parts, allot to IN-HOUSE or a VENDOR (by material, all stages at once)
      |
      +--> In-house: machining steps on the shop floor
      +--> Outsourced: send to vendor, track (Turning, Hardening, Grinding...)
      v
Assembly ----> Trials (T0, T1, T2, corrections) ----> Mould Finished ----> END of the app
```

### BOM categories (one engine, different steps)
All four categories share one data model and one tracking engine. Only the steps differ, and steps are **configured in the database, not hard-coded**.

| Category | Typical steps |
|---|---|
| Mould base parts | Receive, **Squaring, Machining**, Ready to assemble |
| Child parts | Receive, **Squaring, Machining**, Ready to assemble |
| Turn parts | Receive, **Turning, Hardening, Grinding**, Ready to assemble |
| Hardware | Receive, Verify quantity, Issue (**ready-made parts bought from outside; no machining, no planning or vendor allotment**) |

Mould base and child parts follow almost the same process (squaring, then machining). Hardware has no processing. **Assembly is a mould-level step** (before trials), not a part-level step.

---

## 4. Features

### Version 1 (build this first)
1. **Login and roles** (section 2), with English by default and a language choice for Hindi and Marathi.
2. **Create a mould:** mould code (for example `1420BAEM0926`), mould name, customer, trial date (T0), priority.
3. **BOM from photo, PDF or Excel**, with a sheet-style review screen (section 6). Manual add as a backup.
4. **Material receiving:** per mould and per part, mark the received quantity against the BOM, with partial receipts and short or excess flags.
5. **QR box labels (kept simple):** each box of material gets one QR label for its **mould**. Scanning shows which mould the box belongs to. The job page does **not** open automatically; a button "Open mould" is shown and tapped only if wanted. The app prints a label sheet (PDF) per mould. No rack or bin locations, no per-part labels.
6. **Planning by selection (bulk allotment), not part by part:**
   - The Plan screen shows the **BOM in its normal sheet format**, grouped by section and by **material** (for example all 8620 parts together). It covers **Mould Base, Child Parts and Turn Parts only**; Hardware is ready-made and is not planned.
   - The user **ticks many parts** (or taps "Select all 8620"), chooses **one vendor and one set of steps**, and taps **Allot**. Each part gets its stages, vendor and due dates in one action.
   - **The route depends on the section.** Turn parts: Turning, Hardening, Grinding (the material can shorten it, for example 8620 uses all three). Mould base and child parts: Squaring, Machining. Routes are kept in Settings. Stages can be switched on or off before allotting, and one stage can use a different vendor.
   - **In-house or outsourced** is chosen once for the selection. Due dates are calculated for the whole batch.
   - Allotments are saved as a **dispatch batch** (for example "8620 turn parts to Vendor A, sent 12 Nov"), with partial returns shown as "3 of 5 received".
   - Parts already allotted are greyed out unless the user chooses "Re-allot".
7. **In-house work** in the same selection style: tick many parts, update their steps in one tap. The steps shown depend on the section: **Squaring and Machining** for mould base and child parts, **Turning, Hardening and Grinding** for turn parts when done in-house. Hardware has no in-house work, only Receive, Verify and Issue.
8. **Vendor job tracking** (turning, hardening, grinding) using the logic from the Google Sheet. Vendor name is picked from the saved list or added on the spot with "+ Add new vendor" (similar names are suggested to avoid duplicates).
9. **Trials:** T0, T1, T2, correction work, and "Mark mould as Finished".
10. **Auto dates, delay detection, criticality ranking, alerts and remarks history** (section 5).
11. **In-app alerts** (bell icon, Dashboard). No push messages, no WhatsApp messages.
12. **Share button** on the BOM: sends the PDF or XLSX through WhatsApp or any app on the phone. Always visible.
13. **Change trial date or priority** with a reason; all target dates recalculate and the old date is kept in history.
14. **Compare BOM versions** when a BOM is updated, with a warning if a part already has progress.
15. **Manager overview:** active moulds, late parts, vendor delays, trials soon, weekly PDF.
16. **Help and first-run tour,** "?" hints on every unfamiliar field, empty-screen guidance.
17. **Audit history** of every change, and **automatic daily backup and export to Excel**.
18. **Developer panel and kill switch** (section 9).

### Version 2 (later)
- **Gate pass:** a gate pass number and printable gate pass for each dispatch batch sent to a vendor, with gate pass history per vendor. Keep it off all V1 screens, but keep dispatch batches ready to take a gate pass number.
- **Move the database to the office server** (see section 8).
- **Store room QR upgrade** once the store room is organised: per-part labels, rack and bin locations, scan to update status.
- **Vendor scorecard:** on-time percentage and average days per stage.
- Link to, or replacement of, the existing ERP if the app proves it saves time.
- Machine-wise loading, tool and store-room link; customer read-only progress link; customer dispatch tracking.

---

## 5. Business rules (carried over from the working Google Sheet)

These rules already work well in the sheet. Re-implement them exactly.

**Working days**
- Count only working days. **Sundays are excluded.** A `holidays` table lets holidays be added.

**Stage durations (defaults, editable in Settings)**

| Stage | Days |
|---|---|
| Turning | 4 |
| Hardening | 2 |
| Grinding | 3 |

Squaring and Machining durations are not fixed yet: set them in Settings once the team decides (no default is assumed).

**Target dates**
- The To-Be-Finished date applies to Turning and should sit about **10 days before the trial date (T0)**.
- When Turning is marked Done, the next stage's target becomes **today + 3 working days** (2 days plus 1 buffer). When Hardening is Done, the grinding target becomes about **today + 4 to 5 working days**. All numbers come from settings, not code.

**Delay logic**
- Status becomes **Late (DELAY)** only if the target date has passed and the stage is not Done.
- Remarks are added automatically ("Delayed by N days", "Received before date").
- Remarks must be **fair**: the delay is counted from the **actual date the material was sent** to the vendor, so our own late dispatch is not blamed on the vendor.

**Alerts and remarks**
- When a target date is near (default 2 working days), add a short alert in **bold capitals**.
- Alerts and remarks are **never overwritten**. They form an append-only history, newest first, one short line per part, like the Sheet5 remarks. They show inside the app only.

**Statuses**
- Database: `PENDING`, `IN PROCESS`, `DONE`, `DELAY`, `NOT APPLICABLE`.
- On screen: **Waiting, Working, Done, Late, Not needed**. There is no purchasing status.
- `NOT APPLICABLE` is excluded from progress and criticality.

**Ready to assemble**
- A part is ready when all its applicable stages are Done. This is automatic, not a manual YES/NO.

**Criticality ranking**
- For each mould, `readiness = parts_ready / parts_total` (applicable parts only).
- Sort by readiness **ascending**, so 6 of 6 ranks below 10 of 12. Fully ready moulds go to the bottom. Tie-breaker: nearest trial date first.

**Priority**
- Two views everywhere: **by customer** and **by mould**.
- The **trial date (T0) is the top priority date**. Each mould also has a manual priority (Normal, High, Urgent, On hold) that can change at any time, with a reason, and each change is logged.
- If a customer shifts the trial date, change it once. All target dates recalculate and the **old trial date stays in history**, so our own schedule can still be tracked against it.
- A mould **On hold** is hidden from the Dashboard but keeps all data and can be resumed.

**Material-wise dispatch (batches)**
- Turn parts go to vendors **material by material** (for example 8620 first). Each dispatch is a batch: a group of parts, one vendor (or one vendor per stage), a sent date, and calculated due dates per stage.
- A batch has one "sent on" date and one remarks history; each part inside keeps its own stage statuses.

**Archive**
- When a part is ready and all stages are Done, it moves to history automatically with received date, total days, vendor and remarks. History stays searchable.

**2D submitted**
- A per-part checkbox, included in the readiness view.

---

## 6. BOM from image (the BOM sheet is the template)

The review screen is a **copy of the team's Excel BOM sheet**, not a generic table. It must look and read exactly like the sheets people use today (examples: `1420BAEM0926_N50_LID_MOLD.xlsx` and `1420BAEM0926_N50_LID_MOLD_PLATE_SIZE.xlsx`).

**Mould identification code.** Every mould has one code, for example **`1420BAEM0926`**. It identifies the **entire mould**, and every part (mould base, child, turn, hardware) comes under it. The words after it (`N50 LID MOLD`) are the mould name. The code is the main ID everywhere: mould page, QR label, search, reports.

**Sheets in use today.** The mould base is one Excel file (title ends `PLATE SIZE`); child parts, turn parts and hardware are another. The app accepts **either file or photo, in any order, and joins them under the same mould code**. If the code matches an existing mould, parts are added to it; if not, the app offers to create the mould.

| Part of the sheet | Content |
|---|---|
| **Title row** | `<mould code> <mould name> <SECTION>`, e.g. `1420BAEM0926 N50 LID MOLD CHILD PART` |
| **Mould Base (PLATE SIZE)** | **SR NO., NAME, FINISH SIZE, ROUGH SIZE, MATERIAL, QTY**; plates such as TOP PLT, RUNNER PLT, CAVITY PLT, CORE PLT, LINER, EJECTOR PLT, BOTTOM PLT; sizes `LxWxH`; plate steels such as C-45 and P-20 |
| **Child Part** | **No, NAME, FINISH SIZE, ROUGH SIZE, MATERIAL, QTY** (sizes like `66x55x50`) |
| **Turn Part** | same columns; sizes use the diameter sign, e.g. `ϕ44x233` |
| **Hardware** | **No, NAME, SIZE, QTY, REMARK** (REMARK = where it is used, e.g. `GUIDE RAIL/CORE PLT`, or `STD`) |
| **Sign-off block** | **Prepared By, Review By, Checked By, Order By, Date, Received By** (some fields can be empty; the date may be text such as `30.09.2026`) |

### Flow
1. User taps **Add BOM**, then takes a photo or uploads a screenshot, PDF or the Excel file.
2. The Gemini vision API reads the sheet **section by section**, returning each section with its own columns in the picture's order.
3. The **review screen** shows the same sections, columns and order. Doubtful cells get a red border and a small "Please check" note.
4. The user fixes anything and taps **Confirm and save**. Each row becomes a part with its steps attached.

### Review screen features
- **Sheet view** (default): thin-bordered grid like Excel, with the **No and NAME columns fixed** on the left when scrolling sideways. Hint: "Turn phone sideways for a wider view". **Card view** is an optional switch.
- Collapsible section headers with counts ("5 parts"). Sign-off block at the bottom.
- **Tap to edit any cell**; add, delete, move and duplicate rows; the No column renumbers itself.
- **Material dropdown** built from materials already used (P-20, EN-31, 8620, MS-BRIGHT, C-45, STD, ...), with spelling suggestions.
- **Sizes stored twice:** exactly as written and as separate numbers.
- **Size checks (warnings, not blocks):** rough smaller than finish in any dimension; mixed shapes (`ϕ` vs `LxWxH`); missing size or quantity.
- **Duplicate names** in a section are flagged; likely typos can be flagged without changing the text.
- **Hardware REMARK** links to the matching part in the same BOM.
- **Section detection** by the AI, with the option to move a row to another section.
- **Mould code and name** read from the title and confirmed by the user; "Adding to existing mould" is shown when the code exists. A different code from the mould being added to shows a warning and does not save until the user decides.
- **Compare with the previous version** and **original photo side by side**; **Undo and Revert** to the AI's first reading.
- **Export back to the same layout:** XLSX or PDF in this exact sheet format, including title rows and the sign-off block.
- **Excel import** in this format is read directly, with no AI, so it is exact.

### Rules
- Never save AI output without review.
- Keep the original image or file attached to the BOM.
- Tell the AI the section names, column names and known materials so it uses the sheet's own words.

### AI model choice
- Use **Google Gemini (vision)** through one function `extractBom(image)`, so the model can be swapped by a setting.
- Start with **Gemini Flash**. Move to **Flash-Lite** only if it passes an accuracy test; use a stronger model for hard images.
- **Accuracy test (Phase 0):** collect 20-30 real BOM photos and screenshots (clean prints, phone photos, handwritten, tilted, dense), run each through Flash-Lite, Flash and a stronger model, and count missed rows, wrong quantities and wrong columns. Pick the cheapest model that gets about 95% of cells right after the review screen. If none does, switch provider (for example Claude vision) by changing the setting.
- Reported limits (Nov 2026, approximate, confirm in Google AI Studio before launch): free tier is small (about 20 requests/day on newer Flash models, about 500/day on Flash-Lite); paid Tier 1 is about 10,000/day (Flash) and 150,000/day (Flash-Lite). **Enable billing before the pilot**; free-tier data may be used by Google, which you do not want for customer drawings.
- Send one image or PDF page per request and ask for JSON output.

---

## 7. UI design rules and screen list

### Principles
1. **One question per screen.**
2. **Big, plain, tappable:** 48px tap targets minimum, 16px+ text, high contrast, usable with dirty or gloved hands.
3. **Plain words,** the shop's own terms (T0, child parts, mould base).
4. **Words first, never symbols alone.** Every status is a bold word in a pill.
5. **Hints everywhere, hidden when not needed:** first-run tour (4-5 steps, skippable, re-openable from "?"), a "?" next to unfamiliar fields, and empty screens that say what to do next.
6. **Forgiving:** 10-second Undo, nothing is truly deleted, confirmation only for risky actions.
7. **Least typing:** dropdowns, checkboxes, date pickers, photo input.
8. **Language:** English by default; Hindi and Marathi chosen in the profile (all text in a translation file from day one).
9. **Mobile first,** desktop second.
10. **Works with weak network** (see section 9).

### Visual style: white, bordered, red and white
- **Completely white** interface. No dark mode in V1, no coloured panels, no gradients, no shadows.
- Structure by **thin 1px grey borders** (about #D9D9D9) and small rounded corners (6-8px), with generous spacing.
- Text: near-black (#1A1A1A) and mid-grey (#6B6B6B), with strong contrast.
- **Brand colours only logo red (about #D71920) and white,** plus grey for borders and secondary text. Red is used for the main button, the selected tab, small icons and the "Late" pill.
- **Icons are small** (16-20px): a red shape with a white symbol inside; only well-known symbols (tick, clock, exclamation mark, plus, search, camera, share, question mark, bell).
- Main button: red with white text. Secondary button: white with a thin border.
- One clean sans-serif (for example Inter, with Noto Sans for Hindi and Marathi): 16px body, 20px section titles, 28px page titles.
- Tables and lists: rows divided by thin lines, no zebra striping, no coloured cells.
- **Do not copy the reference screenshot** (dark theme, bright colour matrix, rotated headings).
- Keep all colours, sizes and spacing in one **design-token file** so the style can change in one place.

### Status pills

| Pill | Meaning | Look |
|---|---|---|
| **Done** | Finished | White pill, bold red text, thick red border, small red tick |
| **Working** | Work has started | White pill, bold dark text, thick dark border |
| **Waiting** | Not started yet | White pill, bold grey text, grey border |
| **Late** | Past its date | **Solid red pill**, bold white text, white "!" badge (the only filled pill) |
| **Not needed** | Step does not apply | White pill, grey text, thin grey border |

Tapping a pill opens big buttons with the same words. Words are translated into Hindi and Marathi.

### Alerts and remarks
A few **bold words** followed by one short detail line. No emojis. Examples:
- **DELAYED BY 3 DAYS.** Turning, Vendor A, due 12 Nov, still not received. Material went to the vendor 1 day late.
- **DUE IN 2 DAYS.** Hardening, Vendor B, due 14 Nov.
- **SHORT BY 4 PCS.** Received 16 of 20, mould 1420 child parts.
- **RECEIVED BEFORE DATE.** Grinding, Vendor C, 2 days early.
- **TRIAL IN 5 DAYS.** Mould 1420 is 8 of 12 parts ready.

The wording is generated from dates and vendor data, so nobody types it.

### Screen list (24 screens, all designed in Google Stitch)

| # | Screen | Purpose |
|---|---|---|
| 1 | Login | Mobile number plus OTP, or PIN |
| 2 | New mould (manual) | Mould code, name, customer, trial date, priority |
| 3 | **Dashboard** (home) | All active moulds with their status at a glance, late items first, alerts, hint card |
| 4 | Moulds list | Search, filters, by mould or by customer, QR scan button |
| 5 | Scan box label | Shows which mould a box belongs to; opening the mould is optional |
| 6 | Add BOM (4 steps) | Choose source, reading, sheet-style review, saved |
| 7 | Mould detail | Shared live page with Mould Base, Child, Turn, Hardware tabs and remarks history |
| 8 | Receiving | Received quantity against the BOM, short or excess flags |
| 9 | Plan and allot (bulk) | BOM in sheet format for Mould Base, Child Parts and Turn Parts (no Hardware tab), tick many parts or a material, allot with all stages for that section |
| 10 | Dispatch batches | Material sent to vendors, received counts, due dates |
| 11 | In-house work | Tick many parts and update their steps together: Squaring and Machining (base and child), Turning, Hardening and Grinding (turn); no Hardware tab |
| 12 | Part detail | Steps depend on the section: turn parts (Received, Turning, Hardening, Grinding, Ready to assemble); base and child (Received, Squaring, Machining, Ready to assemble); hardware (Received, Verified, Issued); dates and remarks |
| 13 | Trials | T0, T1, T2, correction work, mark Finished |
| 14 | Change trial date or priority | Date, reason, recalculation notice |
| 15 | Box labels | Print the QR label sheet for a mould |
| 16 | Vendors | Job-work vendors and what each holds (with vendor detail) |
| 17 | Manager overview | Active moulds, late parts, vendor delays, trials soon |
| 18 | Alerts (bell) | Alert history inside the app |
| 19 | Compare BOM versions | New, changed and removed parts |
| 20 | Share BOM | Sections, PDF or Excel, share through WhatsApp |
| 21 | Help and tour | Guides, status words, first-run tour |
| 22 | Settings | Profile and language, stage days, alerts, material routes, holidays, customers, users, backup and export (sections shown by role) |
| 23 | Developer panel | Freeze system, backups, audit log, admins, registered devices, kill switch gateway |
| 24 | Kill switch | What will be wiped, OTP, fingerprint, type DELETE, hold to confirm, optional 24-hour wait, "wiped" or "scheduled" end state |

**Not used:** the single-part "Plan Part" form (planning is by selection, screen 9). Section views such as "Turn Parts" are tabs of Mould detail, not separate screens. No purchasing screens, no gate pass fields.

**Role variants:** Viewers see the same screens with all edit buttons, plus buttons, checkboxes and status taps hidden. Operators and Viewers see only "Profile and language" in Settings.

---

## 8. Architecture and data model

### Stack (simple, cheap, solid for a small team)

| Layer | Choice | Why |
|---|---|---|
| App | **PWA**, React + **Next.js**, Tailwind CSS | One codebase for phone and desktop; installs on the home screen; no app store |
| Database | **PostgreSQL via Supabase** (Version 1 demo) | Real relational database, row-level security, auth, file storage, realtime updates, backups |
| Backend logic | Supabase Edge Functions (or a small Node service) | Scheduled jobs (delay checks, alerts), AI call (the Gemini key stays on the server), backups |
| AI extraction | Google Gemini vision behind `extractBom(image)` | See section 6 |
| Files | Supabase Storage | Drawings, BOM photos |
| Hosting | Vercel or Netlify (front end) | Free tier is enough to start |
| Alerts | In-app only | Dashboard and bell icon |

Google Sheets stays as an **export and backup target**, not the source of truth.

### Diagram
```
 Phone / Desktop (PWA)
   |  local cache (IndexedDB) <-- works offline, syncs later
   v
 API layer (Supabase: Auth, REST, Realtime)
   |
   +--> PostgreSQL (moulds, parts, steps, receiving, vendors, audit_log)
   +--> Storage (drawings, photos)
   +--> Edge Functions
          - nightly: recalc delays, criticality, alerts
          - AI: image -> BOM rows
          - backup: dump -> separate backup storage
```

### Shared live page (many users at once)
- Each mould has **one shared page** with tabs Mould Base / Child Parts / Turn Parts / Hardware. Everyone can see and edit every tab. The app remembers each person's last tab.
- Changes appear on every phone within a second or two (Supabase Realtime).
- **No "who is editing" labels** are shown on rows. With many people on the app, they would flood the screen. Changes simply appear, and the audit log records who made each one.
- If two people change the **same field** at once, the last change wins, the older value is kept in history, and the first person sees "Updated by Suresh just now".
- Offline changes merge on reconnect; conflicting offline edits appear in a short review list instead of being overwritten.

### Moving to the office server (Version 2)
- The database is plain PostgreSQL, so it moves without a redesign.
- Keep all database logic in versioned **SQL migration files**, and keep Supabase-specific calls behind a small data-access layer.
- Self-host the open-source Supabase stack (Docker) or plain PostgreSQL plus a small API.
- Migration: dump the cloud database, restore on the server, copy files, switch app settings, run both in parallel for a few days, then switch off the cloud.
- Before the move, confirm: a UPS, a second disk for backups, a fixed network address, a person who looks after it, and secure access from phones (HTTPS with VPN or a secure tunnel, never an open port).

### Data model (core tables)
```
users             id, name, phone, role (developer|admin|operator|viewer), language, active, hidden (true for developer)
customers         id, name, code
jobs              id, customer_id, mould_code (unique, e.g. 1420BAEM0926), name (e.g. N50 LID MOLD),
                  qr_code (encodes the mould code), trial_date_t0, status (active|on_hold|finished|archived),
                  priority (normal|high|urgent), created_by
job_date_history  id, job_id, field (trial_date_t0), old_value, new_value, reason, changed_by, at
bom_sheets        id, job_id, section (base|child|turn|hardware), title, prepared_by, review_by, checked_by,
                  order_by, received_by, sheet_date, source_image, revision_no
bom_revisions     id, job_id, revision_no, snapshot, reason, created_by, at
bom_items         id, job_id, category (base|child|turn|hardware), serial_no, name, material,
                  finish_size_text, rough_size_text (as written, e.g. ϕ44x233), finish_dims, rough_dims (parsed),
                  size_text (hardware), remark (hardware: where used), used_with_item_id,
                  qty_required, drawing_ref, two_d_submitted, notes
step_templates    id, category, step_name, order_no, default_days, active
material_routes   id, material, step_name, order_no     <- e.g. 8620: Turning, Hardening, Grinding
dispatch_batches  id, job_id, label, mode (inhouse|outsourced), sent_on, created_by, notes
batch_items       id, batch_id, bom_item_id, qty_sent, qty_back
part_steps        id, bom_item_id, batch_id, step_name, status, mode (inhouse|outsourced),
                  vendor_id, planned_date, started_on, done_on, target_date
vendors           id, name, contact, type
receiving_checks  id, bom_item_id, qty_expected (from BOM), qty_found, result (ok|short|excess|wrong), checked_by, checked_on
movements         id, bom_item_id, from, to (store|vendor|shop|assembly), qty, dispatched_on, returned_on
remarks           id, entity_type, entity_id, text, kind (manual|alert|delay|info), created_at, created_by   <- append only
holidays          id, date, note
settings          key, value     <- stage days, alert window, buffer days
user_prefs        user_id, language (en|hi|mr)
developer_credentials  user_id, device_name, public_key (WebAuthn), registered_on
kill_requests     id, requested_by, scheduled_for (empty = immediate), status (scheduled|cancelled|done), created_at
                  <- the record is also emailed to the Developer, since this table is wiped too
audit_log         id, user_id, table, row_id, action, old_value, new_value, at
```

Rules:
- **Soft delete** (`archived_at`) everywhere. Never hard-delete (the kill switch is the one exception, section 9).
- Every write goes through the audit log (a database trigger, not app code).
- `readiness` and `criticality` are database **views**, so they are always correct.
- Gate pass fields are **not** part of V1 tables.

---

## 9. Data safety, backups and the kill switch

### Everyday safety
1. **Save instantly.** Every tap saves; there is no Save button to forget.
2. **Offline queue.** Changes are held on the phone and sent when the network returns, with a banner "Saved on phone, will sync".
3. **Automatic backups (3 layers):**
   - Daily managed database backup with point-in-time recovery (Supabase paid tier, or a `pg_dump` job on your own server).
   - Nightly **export to Google Drive** as Excel plus CSV per table.
   - Weekly full dump copied to a **second location** (an office PC or external drive).
4. **Retention:** daily backups kept 30 days, monthly backups at least 2 years, yearly copies permanently.
5. **Restore drill:** once a month, restore the latest backup to a test copy and check it opens.
6. **Undo and history:** the audit log plus soft delete recovers a wrongly changed record.
7. **"Export all to Excel"** button so nobody feels locked in.
8. Secrets and API keys stay in environment variables, never in front-end code.

### Long-running moulds
- A mould can run for months while priorities shift and new moulds arrive. **Nothing is auto-deleted.** Finished moulds are archived (still searchable and reopenable).
- **Flexible BOM:** parts can be added, split, merged, renamed or cancelled mid-job, and each change keeps the old version (BOM revisions).
- Plan for about 10 new moulds arriving while older ones continue; lists have filters (active, on hold, finished) and search.
- **Security:** role-based access, row-level security, encrypted connections, no shared logins, OTP or PIN login, instant removal of a person's access, drawings kept private with expiring links.

### Developer panel (Developer only)
- **Freeze system:** instantly blocks all logins except the Developer's; reversible with one tap.
- **Kill switch** (below), **backups** (restore and see where they are stored), **audit log**, **Admins** (create or remove), **registered devices**.

### Kill switch: the "nuclear switch"
It wipes the **entire live system**: every mould, part, BOM, photo, file, user account and setting. **The backups are never touched**, so everything can be restored later.

How it works:
1. Developer opens Developer panel, then **Kill switch**. A red-bordered screen lists what will be wiped and says "Backups will be kept."
2. **Step 1, OTP:** a code is sent by SMS to the Developer's registered number and must be entered within 5 minutes.
3. **Step 2, fingerprint:** the phone's fingerprint prompt through a **passkey (WebAuthn)**. The fingerprint never leaves the phone and is never stored; the app stores only a public key for the registered device.
4. The Developer types **DELETE**, then **holds a red button for 5 seconds**.
5. The system **wipes at once** by default. An optional setting "Wait 24 hours before wiping" schedules it instead, with a Cancel button that needs the same two steps.
6. A record "System wiped by Developer at <time>" is emailed to the Developer.

**Backups must be out of the kill switch's reach**
- Backups live in a **separate storage account** (the Google Drive export and the second location), with their own access, so the live system has no permission to delete them.
- The app's login can only **add** to the backup location, never delete. Deleting backups is a manual action outside the app.
- Backups are **encrypted**; the Developer holds the key.
- **Restore plan:** deploy a fresh copy of the app, restore the chosen backup, register the Developer's devices again. Test this restore monthly.

**Safety rules**
- Only a Developer account with a **registered fingerprint device** can use it. Register at least **two devices**.
- Failed OTP or fingerprint attempts lock the kill switch for 1 hour and alert the Developer.
- It is never reachable by an Admin or through the normal Settings screen.
- If the latest backup is older than 24 hours, the screen offers a one-tap backup first.
- SMS OTP needs an SMS provider; in India this means a registered sender and message templates under DLT rules, so plan for it early. An authenticator-app code can replace SMS if SMS becomes a problem.

---

## 10. Build plan

| Phase | Duration (est.) | Output |
|---|---|---|
| **0. Discovery** | 1 week | Shadow the team for 2 days; run the AI image-reading accuracy test; collect real paper and Excel formats; confirm words used; test the Stitch screens with 3 users (one young, one older, one manager). |
| **1. Foundation** | 1-2 weeks | Database and migrations, auth, four roles with row-level security, audit log, backups running from day one, design system (tokens, buttons, status pills, hint component, translation file). |
| **2. Moulds + BOM** | 2 weeks | Create mould, BOM from image, PDF and Excel, sheet-style review, parts by category, Compare BOM, Share BOM, Excel import and export. |
| **3. Receiving** | 1-2 weeks | Receive material against the BOM, partial receipts, short or excess flags, QR box labels (print and scan). |
| **4. Planning, vendors and in-house** | 2-3 weeks | Material routes, bulk allotment, dispatch batches, vendor stages, in-house work, working-day logic, delay and alert engine, remarks history. |
| **5. Dashboard, alerts, trials, overview** | 1-2 weeks | Criticality ranking, Dashboard, bell alerts, trials and Finished state, change trial date or priority, manager overview. |
| **6. Developer panel and kill switch** | 1-2 weeks | Developer role, passkey registration on two devices, SMS OTP provider setup, freeze system, kill switch, backup-out-of-reach setup and restore test. |
| **7. Pilot** | 2-3 weeks | One live mould, run **in parallel with paper** for 2 weeks, fix pain points daily. |
| **8. Rollout** | 2 weeks | All moulds moved over, paper stopped, training sheet and short videos in Hindi and Marathi, Excel retired. |

Start with **Turn parts**: they are already proven in the Google Sheet. Then reuse the engine for child parts, mould base and hardware by adding step templates.

---

## 11. Testing and rollout checklist

- [ ] Every screen tested on a cheap Android phone with a slow connection.
- [ ] Tested by someone who has never seen it, with no instructions; note where they hesitate.
- [ ] Working-day maths tested with Sundays, holidays and month ends.
- [ ] Delay logic tested with late sending of material to the vendor (fairness rule).
- [ ] AI reading tested on the real BOM sheets (accuracy test passed).
- [ ] Two or three people edit the same mould at once; nothing is lost or overwritten silently.
- [ ] Offline test: airplane mode, 10 changes, reconnect, nothing lost.
- [ ] QR box labels printed on the real label paper and scanned in store lighting, with scratched or dirty labels, near and far.
- [ ] Roles tested: Viewers cannot edit, Operators cannot open admin settings, Admins cannot see the Developer panel.
- [ ] Backup restored successfully at least once before go-live, including a full restore after a test wipe.
- [ ] Kill switch tested on a **test copy** (OTP, fingerprint on two devices, schedule and cancel), and the backups were confirmed untouched.
- [ ] Printed one-page quick guide at each workstation.
- [ ] Two "champions" trained first (one older, one younger).

---

## 12. Decisions made, assumptions and open points

### Decisions made
| # | Topic | Decision |
|---|---|---|
| 1 | Scope | Material received to trials done; mechanical side only; no purchasing; no customer dispatch |
| 2 | Users | Developer, Admin, Operators (project manager team), Viewers; one shared live page per mould |
| 3 | Devices | Everyone has their own smartphone |
| 4 | Database | Supabase for Version 1, office server in Version 2 |
| 5 | Language | English by default; Hindi and Marathi by choice |
| 6 | Priority | Customer-wise and mould-wise; trial date is the top priority date |
| 7 | WhatsApp | A normal Share button only; alerts stay inside the app |
| 8 | QR | One QR label per mould box; scan shows the mould; opening it is optional |
| 9 | Planning | Bulk selection and allotment by material, not part by part |
| 10 | Long-running moulds | Data is kept, flexible and secure; BOM revisions and date history |
| 11 | ERP | Standalone for now; may replace it later |
| 12 | Gate pass | Version 2 |
| 13 | UI | Pure white, bordered, red and white brand; plain-word status pills; bold alerts |
| 14 | Kill switch | Developer only; OTP plus fingerprint; wipes everything except backups; wipes at once by default, optional 24-hour wait |
| 15 | Steps by section | Turn parts: Turning, Hardening, Grinding. Mould base and child: Squaring, Machining. Hardware: ready-made, no processing |
| 16 | Viewer and restore | Viewers can share a BOM; restore from backup is Developer-only |

### Confirmed answers
- **Viewers can view and share a BOM.**
- **Restore from backup is a Developer-only action.** Admins can back up and export, but the Restore button must not appear for them.
- **Steps differ by section:** turn parts go Turning, Hardening, Grinding; mould base and child parts go Squaring, Machining; hardware is ready-made, bought from outside, and only gets Receive, Verify and Issue.

### Assumptions to confirm
- Material routes other than 8620 (for example EN-31 = Turning, Grinding) are examples; the real routes are set in Settings.
- Squaring and Machining durations (days) are to be set in Settings.
- The logo red is about #D71920 (the value used in the Stitch screens); take the exact value from the logo file.

### Open points (none block the start)
- **Office server details** (fixed address, backup drive, who looks after it): to be checked before Version 2.
- **SMS provider** for the Developer OTP (DLT registration in India), or use an authenticator app instead.
- **AI model** to be chosen by the Phase 0 accuracy test.

---

## 13. Starter prompt for a coding assistant (Claude Code)

> Build a mobile-first PWA called "Mould Job Tracker" using React, Next.js, Tailwind and Supabase (Postgres, Auth, Storage, Edge Functions). Follow `MOULD_JOB_TRACKER_FINAL_PLAN.md` in this repo. The app starts when raw material is received and ends when a mould's trials are done; it never tracks purchasing.
>
> Start with Phase 1: create the database schema from section 8 with SQL migrations, row-level security for the four roles (developer, admin, operator, viewer), an audit-log trigger, soft delete, and a nightly backup job that writes to a separate storage location the app cannot delete from. Then build the design system: white pages, thin 1px grey borders, logo red used only for the main button, selected tab, small icons and the Late pill; large 48px buttons; bold plain-word status pills (Done, Working, Waiting, Late, Not needed); a reusable HelpHint component and a first-run tour. Put every user-visible string in a translation file (en, hi, mr).
>
> Do not copy dense matrix UIs. Use a vertical layout on mobile and tabs (Mould Base, Child Parts, Turn Parts, Hardware) on the mould page. Write tests first for the working-day and delay logic (Sundays excluded, stage durations 4/2/3 days, delay counted from the actual sent date). Implement `extractBom(image)` as a swappable function behind a setting.

---

## 14. Appendix: Stitch design brief

Paste this at the start of any new Stitch screen prompt to keep the style consistent.

```
Mobile-first web app "Mould Job Tracker" for project managers in a mould manufacturing company. STRICT STYLE: completely white interface, no dark mode, no gradients, no shadows, no coloured background panels. Structure only by thin 1px light-grey borders, small rounded corners (6-8px) and generous spacing. Plain sans-serif (Inter), 16px minimum text, near-black text, mid-grey secondary text. Brand colours ONLY red (logo red, approx #D71920), white and grey. Red is used only for the main button (red with white text), the selected tab, small icons and the "Late" status. Icons are small (16-20px): a red circle or rounded square with a white symbol inside, well-known symbols only. Status is always a bold word in a pill: Done = white pill, bold red text, red border, small red tick; Working = bold dark text, thick dark border; Waiting = bold grey text, grey border; Late = solid red pill, bold white text; Not needed = grey text, thin grey border. Alerts are a few bold words followed by one short detail line, no emojis. Every screen: top bar with title, bell icon, "?" help button, language switch (EN / हिं / मरा). Bottom navigation: Dashboard, Moulds, Vendors, Help (selected item red). Tap targets at least 48px high. No dense colour matrices, no rotated headings. The app does not track purchasing and has no gate pass in Version 1.
```
