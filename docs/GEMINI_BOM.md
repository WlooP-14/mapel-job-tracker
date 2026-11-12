# Gemini BOM extraction

The configured model is regular Gemini 3 Flash, `gemini-3-flash-preview`, verified using the Models API for the supplied key. There is no plain `gemini-3.1-flash` in that model list. Flash-Lite is not used, and failed requests never fall back to another model or provider.

## Server configuration

Local development reads these values from the ignored `.env.local`. For Vercel, add them under the existing project's **Settings → Environment Variables**, enable them for Production, and redeploy:

```dotenv
GEMINI_API_KEY=<private key saved locally>
BOM_GEMINI_MODEL=gemini-3-flash-preview
BOM_EXTRACTION_PROVIDER=gemini
```

These variables must remain server-only. Never add a `NEXT_PUBLIC_` prefix or commit a real key. No Vercel administrator session was available during implementation, so the hosted environment still needs these values. Existing Supabase settings also control the provider; an admin can choose Gemini or Manual entry under **Settings → BOM reading**. A database setting takes precedence over the environment default.

## Use

Keep the existing two-step file attachment flow. After saving one or both original BOMs, choose **Add parts from this file → Read with Gemini**. Photos, screenshots (PNG/JPG/WebP) and PDFs are read into an editable draft. Excel import continues locally without Google. The original file is read from private Supabase Storage by the server using the signed-in person's access; the browser never receives the Gemini key or a public source URL.

Only active admins and operators (and the internal owner role) can extract parts, and only for an active or on-hold mould. Extraction does not write BOM rows. Review sections, dimensions, quantities, mould code and unclear cells before **Confirm and save**. Existing import matching, explicit review and history safeguards remain in use. Unknown quantities stay blank instead of being invented. Repeated names remain separate extracted rows for review. Current draft rows are not replaced by another extraction.

Each file is limited to 10 MB and 1,000 extracted rows. Incomplete, blocked or truncated model responses fail for review. Quota errors offer retry later or manual entry, without an automatic paid fallback. The integration does not enable Google billing. Google account quotas and existing billing configuration remain controlled by the account owner; use an unbilled/free-tier Google project to enforce no charges. Google's free-tier data terms apply to files sent to Google.

## Verification

A synthetic two-row PDF was successfully read by `gemini-3-flash-preview`, preserving part names, quantities, dimensions and Turn Parts categories. No company BOM was used for that live test. Tests cover role/source checks, provider switching, exact model selection, unknown quantities, repeated rows, sanitization and safe quota/truncation failures. Hosting activation and mobile visual verification remain separate from those checks.

References: [model](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).
