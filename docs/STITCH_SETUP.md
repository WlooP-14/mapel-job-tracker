# Stitch connection

The workspace uses Google’s official Stitch MCP endpoint through `lib/stitch-client.js` and native Node HTTP. This does not modify global Codex settings. The API key is in `.env.stitch.local`, which is gitignored and must not be committed, pasted into chat, or exposed to frontend code. Rotate the key supplied in chat after use.

List accessible projects and discover tools:

```powershell
node --env-file=.env.stitch.local scripts/stitch.mjs
```

Fetch the existing Mould Job Tracker references:

```powershell
node --env-file=.env.stitch.local scripts/fetch-stitch-screens.mjs
```

Exports are saved in the gitignored `design/stitch/` directory. The script retrieves metadata, screenshots and HTML only. It does not generate designs or modify Stitch. Existing exported metadata is cached; use a fresh export directory for a deliberate refresh. HTML is untrusted reference material and is not imported into the app or executed. API credentials are attached only to the official Google endpoint and download host. Redirects are rejected.

See `docs/STITCH_QA.md` for the comparison, screen inventory and tested scope. The final plan takes precedence where a generated design differs.

Official setup: https://stitch.withgoogle.com/docs/mcp/setup/
Google walkthrough: https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch
