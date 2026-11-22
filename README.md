# Dayflow

Dayflow is a cloud-based personal work assistant with persistent tasks, AI execution, web research, document generation, public-page browsing and approval-gated Gmail delivery.

## Implemented workflows

- **Persistent workspace:** Supabase Auth, per-user workspaces, projects, tasks, task events, execution status and saved results.
- **Assistant memory:** User-controlled saved preferences, instructions, project context and decisions. Users can review and delete saved entries.
- **Reusable workflows:** Save repeatable instructions and launch them as real Dayflow tasks.
- **AI task planning:** OpenRouter generates actionable plans.
- **Research:** Tavily retrieves web sources; OpenRouter creates a sourced brief saved to the task.
- **Documents:** OpenRouter generates Markdown documents saved with the task; users can download the Markdown file.
- **Browser tasks:** Browserbase + Playwright Core opens a user-supplied public HTTPS page in an isolated browser session and summarizes visible page content. Private/local network addresses are blocked. This workflow is read-only.
- **Email:** AI prepares a draft. The task displays the recipient, subject and body and waits for explicit approval. Sending uses the connected Google account and Gmail API.
- **Google OAuth:** Refresh tokens are encrypted at rest; OAuth state is hashed, expires and is single-use.

## Environment variables

Required for core use:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

AI and research:
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (optional; defaults to `openai/gpt-4.1-mini`)
- `TAVILY_API_KEY`

Browser tasks:
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

Google email:
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to the browser)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (64 hex characters / 32 bytes)
- `GOOGLE_OAUTH_STATE_SECRET` (64 hex characters)
- `APP_URL` (canonical HTTPS app origin)

Keep all secrets in Vercel Environment Variables. Never commit them or paste them into chat. Configure the Google OAuth redirect URI as `APP_URL/api/connectors/google/callback`, and enable the Gmail API in the Google Cloud project.

## Database

Apply migrations in order:
1. `supabase/migrations/001_dayflow_schema.sql`
2. `supabase/migrations/002_execution_and_google.sql`
3. `supabase/migrations/003_workspace_intelligence.sql`

The second migration adds execution metadata and the server-only Google OAuth connection tables. The Google tables have RLS enabled and intentionally have no client-facing policies.

## Local development

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Configure the environment variables in a local `.env` file.
4. Run `npm run check` and `npm test`.
5. Run `npm run dev` and open `http://localhost:3000`.

## Safety and current scope

- Email delivery is never triggered just by generating a draft; a user must review and approve it.
- Browser automation is limited to reading public HTTPS pages; it does not log into accounts, submit forms or make purchases.
- Billing/checkout, scheduled workflow triggers, team collaboration, and native DOCX/PDF export remain future product areas. Project records, assistant memory, and reusable workflow templates are available after migration 003.
- Do not enable paid subscriptions until billing webhooks and server-side entitlements are implemented.
