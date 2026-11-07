# Mould Job Tracker team pilot

Deploy the Next.js app to a Netlify Free team. The app uses the existing Supabase project for sign-in and data. Test with a sample mould so reviewers can try the workflow without changing a live job.

## Publish from PowerShell

1. Open PowerShell in the project folder and run `npx --yes netlify-cli login`. Authorize the CLI in your browser.
2. Run `node scripts/prepare-pilot.mjs`, then `Set-Location .pilot-deploy` and `npm ci --ignore-scripts`. This prepares a copy with only the app and the two public Supabase settings.
3. Run `npx --yes netlify-cli deploy --prod`. On the first run, create a project on your Free team or select the intended project when prompted. The CLI builds locally and reports the HTTPS URL.
4. Open the URL on a phone. Check sign-in, a mould, and the install option from the browser menu. Share the HTTPS URL and give each tester their own account. Use Viewer for read-only review and Operator for hands-on testing. The existing local Settings can provision accounts when configured with the server key.

The local build uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. The legacy anon key also works if that is how the project is configured. For future builds on Netlify, set those same public values in the dashboard. Keep `.env.local` and other private environment files off Git and out of manual uploads. The hosted pilot can use existing accounts. Creating accounts from hosted Settings also requires `SUPABASE_SERVICE_ROLE_KEY` as a server-only Functions variable, so handle provisioning locally for the pilot.

## Feedback form

**Title** Mould Job Tracker pilot feedback

**Intro** Try one task on a sample mould and tell us how it went. Please leave out PINs and customer details. Name is optional.

1. Which task did you try? (Sign in or install, find a mould, receive parts, plan or allot work, share Excel, or another task)
2. Were you able to finish it? (Yes on my own, yes with help, or no)
3. How easy was it? (1 very difficult to 5 very easy)
4. Where did you get stuck or have to guess? (Short answer)
5. What is the one change that would help you most? (Short answer)
6. Which device did you use? (Android, iPhone, or computer)
