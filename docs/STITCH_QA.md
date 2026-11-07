# Stitch screen fetch and Phase 1 QA

Checked 3 November 2026 (India time).

## Source and exports

- Stitch project: Mould Job Tracker (`17790339362858590407`).
- Official endpoint: `https://stitch.googleapis.com/mcp`.
- Fetched 36 current screens: 36 decoded screenshots and 35 decoded HTML documents; one screen is an image-only asset.
- All 36 image files decoded successfully; all 35 HTML references contain HTML document markup.
- Full export manifest: `design/stitch/manifest.json`. Private references are gitignored.
- The connection is a workspace script, not a globally installed Codex MCP server. No new package was installed.
- Only existing-project/screen reads are allowed; design generation and edits are blocked by the client.

## Live app checks

- Existing developer session opened Settings and stage-duration data loaded from Supabase.
- English, Hindi and Marathi labels rendered. English was restored after testing.
- Hardware tab selected and displayed its empty state.
- HelpHint expanded and closed.
- Tour reopened from Help; Next advanced and Skip closed it with focus returned to its launch button.
- Settings was checked at the default browser size and with a requested 390 × 844 mobile viewport override. The override was reset afterward.
- Existing stage durations were not changed.
- Found and fixed a delayed language-preference response overwriting a newer language selection; added cancellation guards for stale profile/job responses.
- Automated suite: 14 passing tests, including MCP SSE parsing, credential-safe error handling and blocking write tools.

## Differences requiring deliberate decisions

| Reference | Difference | App decision |
| --- | --- | --- |
| Login | SMS verification and optional 4-digit PIN | Keep the authorized phone + 8–12 digit PIN flow; no SMS. |
| Admin Settings | Restore buttons, automatic-backup success examples | Restore stays developer-only. No claim of running backups until independently configured and restored successfully. |
| Several references | Grey panels and inconsistent small label text | Retain the final plan’s white surfaces, 1px borders, 16px body text and 48px targets. |
| Project design theme | Includes “To order” status | Exclude purchasing and that status. |
| Legacy canvas instances | Includes single-part Plan Part screen | Follow bulk Plan & Allot instead. |

## Scope

Reference retrieval is distinct from implementation. Login/navigation/Help/Settings, mould list/create/detail, BOM review, Receiving, bulk Planning/work and Assembly/Trials now use reusable React components and real Supabase data. Mobile/browser and hosted-role checks are recorded in IMPLEMENTATION_STATUS.md. Manager PDF overview, QR labels and developer kill-switch UI remain reference-only. Reference HTML was never executed as application code. No pixel-perfect or physical-device parity is claimed.

## Screen inventory

| Title | Screen ID |
| --- | --- |
| Add BOM - Mould Job Tracker | 879ce9e2fbae4940889a8f37186f5054 |
| Alerts - Mould Job Tracker | d735aae56b974ab6ae1a00240ae6daa4 |
| BOM saved - Mould Job Tracker | c2c859c3316d46f68a2414147485b521 |
| Box labels - Mould 1420BAEM0926 - Mould Job Tracker | c120ba9193db47c2a6ca2d465f2af310 |
| Change trial date or priority - Mould 1420 | 5291ffe3e874450485661b619ccd80fe |
| Compare BOM - Mould 1420BAEM0926 | f5c0c810bc614d44b4a69ee20bb5616d |
| Dashboard - Mould Job Tracker | 9a7e2f2274d44ac895f822c544afc367 |
| Dashboard - Mould Job Tracker | f5305925c67046c6b4ef4fe8080bb0ae |
| Developer Panel - Mould Job Tracker | ea068154b9354d75a1c226cede39f6f5 |
| Dispatch batches - Mould 1420BAEM0926 - Mould Job Tracker | 2cce00a8660f4853af146eb2c51fd224 |
| Help & Tour - Mould Job Tracker | 78a2872f341049b7b4c4f4e579e36bbe |
| image.png | 10216555205323241766 |
| In-house work - Mould 1420BAEM0926 - Mould Job Tracker | eeeb7eff1c4a421caab20298822ece82 |
| Kill Switch: Scheduled Wipe State | e622221a6852440ea7d2c02ecfb5a987 |
| Kill Switch: Step 1 - Wipe Scope | d28ff7599d2c40f79b9c3478b77b190e |
| Kill Switch: Step 2 - Enter OTP | ccffdf8628014e1381b3f239f679e79a |
| Kill Switch: Step 3 - Fingerprint | 518606c112e84f15ba9444c478d9f55e |
| Kill Switch: Step 4 - Confirm Wipe | 76e6a6d0c971436c925a44cf656af451 |
| Kill Switch: System Wiped | 2d3384aa25e843e9acd814dfa85c9aed |
| Login - Mould Job Tracker | 601ff155018e42cf8c5ecdceb1ff12c3 |
| Mould 1420 Detail (Viewer View) - Mould Job Tracker | 7b9623a643d74b16bda9961aecea0efb |
| Mould 1420 Turn Parts - Mould Job Tracker | 1b87048a3da9467b885944b883834e10 |
| New mould - Mould Job Tracker | 47aed652c2d34e9b899bd967e5b1f7de |
| Overview - Management - Mould Job Tracker | 7ed90728902e434bb7530fe7a882baa7 |
| Part detail - Sprue Bush - Mould Job Tracker | 20360c29235741208905db72015bb152 |
| Plan & Allot - Mould 1420 - Mould Job Tracker | a9991a812dcc4cb3ad5374bb9075a545 |
| Reading your sheet - Mould Job Tracker | a8f8ed1b86804de4aeee81341e64c31f |
| Receiving - Mould 1420BAEM0926 - Mould Job Tracker | cdc0ff4d26244945af62b78a638abc85 |
| Review BOM - Mould Job Tracker | 59a26daaef334b459706b08dff53b3db |
| Scan box label - Mould Job Tracker | c7a1afe999ca41dca79790255b6450b7 |
| Settings - Mould Job Tracker | 0bbe1ddeaf2f40e394aaca5a298a6b09 |
| Settings (Operator View) - Mould Job Tracker | 17284d87c86c42b3af6121b1f2520b4f |
| Today (Viewer View) - Mould Job Tracker | cff10af4ee61461ab0dd3b0331970eb2 |
| Trials - Mould 1420BAEM0926 - Mould Job Tracker | c9d140fa24c04f2e84f8b8730de09e0b |
| Vendor A - Penta Precision - Mould Job Tracker | b63474d246e54b849ec05c8952200262 |
| Vendors - Mould Job Tracker | 739dcb4e46044e498881f6091deee264 |
