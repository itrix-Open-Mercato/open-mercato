# InboxOps Local Dev — Fixes & Improvements

**Date**: 2026-04-11
**Status**: Draft
**Module**: `inbox_ops` (`packages/core/src/modules/inbox_ops/`)
**Related**: SPEC-037 (InboxOps Agent)

---

## TLDR

During local setup of InboxOps with Resend + ngrok, several friction points were discovered. This spec documents fixes and one new feature to contribute back to Open Mercato as separate PRs.

---

## PR 1: Fix `.env.example` — API key env var names don't match what code reads

**Type:** Bug fix
**Priority:** High — causes silent misconfiguration

**Problem:**
`.env.example` documents these env var names:
```
OPENCODE_ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENCODE_OPENAI_API_KEY=your_openai_api_key_here
OPENCODE_GOOGLE_API_KEY=your_google_api_key_here
```

But `@open-mercato/shared/src/lib/ai/opencode-provider.ts` (line 14-33) reads:
```typescript
anthropic: { envKeys: ['ANTHROPIC_API_KEY'] },
openai:    { envKeys: ['OPENAI_API_KEY'] },
google:    { envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY'] },
```

Setting `OPENCODE_ANTHROPIC_API_KEY` does nothing — the provider resolver never reads it. The error message `Missing API key for provider "anthropic"` gives no hint about the correct env var name.

**Fix options (pick one):**

A. **Update `.env.example`** to match what code reads (minimal change):
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here
   ```

B. **Update `opencode-provider.ts`** to also check `OPENCODE_*` prefixed variants (backwards-compatible):
   ```typescript
   anthropic: { envKeys: ['ANTHROPIC_API_KEY', 'OPENCODE_ANTHROPIC_API_KEY'] },
   openai:    { envKeys: ['OPENAI_API_KEY', 'OPENCODE_OPENAI_API_KEY'] },
   google:    { envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'OPENCODE_GOOGLE_API_KEY'] },
   ```

**Recommendation:** Option B — it fixes existing installs without forcing env var renames, and `envKeys` already supports multiple fallbacks.

**Files:**
- `packages/shared/src/lib/ai/opencode-provider.ts` — add fallback env key names
- `packages/create-app/template/.env.example` — update comments to list both accepted names
- `packages/shared/src/lib/ai/__tests__/opencode-provider.test.ts` — add test for `OPENCODE_*` variants
- `packages/ai-assistant/src/modules/ai_assistant/frontend/components/AiAssistantSettingsPageClient.tsx` — fix hardcoded fallback `'OPENCODE_ANTHROPIC_API_KEY'` → `'ANTHROPIC_API_KEY'` (line 188)

---

## PR 2: Auto-sync `inbox_settings.inbox_address` domain when `INBOX_OPS_DOMAIN` changes

**Type:** Bug fix / DX improvement
**Priority:** Medium

**Problem:**
`onTenantCreated` in the inbox_ops setup generates the inbox address using `INBOX_OPS_DOMAIN` at tenant creation time. If the env var changes later (e.g., switching from `inbox.mercato.local` to `eiolduuamb.resend.app`), existing `inbox_settings` records keep the old domain. The webhook handler matches on the full `inbox_address`, so emails silently get 200 OK but are never stored (no matching inbox).

This requires a manual SQL UPDATE — a bad DX trap for local development where the domain changes frequently.

**Proposed fix:**
Add a startup check (or a `seedDefaults` guard) that detects domain drift:

```typescript
// In setup.ts seedDefaults or a dedicated startup hook
const currentDomain = process.env.INBOX_OPS_DOMAIN
if (currentDomain) {
  const settings = await em.find(InboxSettings, { organizationId, tenantId })
  for (const s of settings) {
    const [localPart, existingDomain] = s.inboxAddress.split('@')
    if (existingDomain && existingDomain !== currentDomain) {
      s.inboxAddress = `${localPart}@${currentDomain}`
    }
  }
  await em.flush()
}
```

**Files:**
- `packages/core/src/modules/inbox_ops/setup.ts` — add domain sync logic
- `packages/core/src/modules/inbox_ops/__tests__/setup.test.ts` — test domain drift detection

---

## PR 3: Allow editing inbox address domain in Settings UI

**Type:** Enhancement
**Priority:** Low

**Problem:**
The InboxOps Settings page (`Backend > InboxOps > Settings`) shows the inbox address as read-only. When the domain is wrong, the only fix is a manual DB update.

**Proposed fix:**
Add an "Edit domain" action to the settings page that lets admins change the domain part of the inbox address (keeping the `ops-{code}@` prefix). Alternatively, show a warning banner when the displayed domain doesn't match `INBOX_OPS_DOMAIN`.

**Files:**
- `packages/core/src/modules/inbox_ops/backend/settings/page.tsx` — add edit action or warning
- `packages/core/src/modules/inbox_ops/api/settings/route.ts` — add PATCH support for domain update

---

## PR 4: Improve error message for missing AI provider API key

**Type:** DX improvement
**Priority:** Medium

**Problem:**
When the API key is missing, the error stored in `inbox_emails.processing_error` is:
```
LLM extraction failed: Missing API key for provider "anthropic"
```

This doesn't tell the user which env var to set. Since `.env.example` has the wrong name, users set `OPENCODE_ANTHROPIC_API_KEY` and are stuck.

**Proposed fix:**
Include the expected env var name(s) in the error message:
```
LLM extraction failed: Missing API key for provider "anthropic".
Set ANTHROPIC_API_KEY in your .env file.
```

**Files:**
- `packages/shared/src/lib/ai/opencode-provider.ts` — update error message in `resolveOpenCodeProviderApiKey` or caller
- `packages/core/src/modules/inbox_ops/lib/extractionPipeline.ts` (or wherever the error is thrown) — pass env key name into error

---

## PR 5: Add Received Emails list page to InboxOps backend

**Type:** New feature
**Priority:** Medium

**Problem:**
The InboxOps backend UI focuses on proposals — the output of LLM extraction. There is no page to view raw received emails, their processing status, or errors. During local development and production troubleshooting, operators need to answer:
- Did the email arrive?
- Did extraction succeed or fail? Why?
- What was the raw content?

Currently this requires direct DB queries (`SELECT * FROM inbox_emails`).

**Proposed solution:**
Add a **Received Emails** list page to the InboxOps backend section.

**List view columns:**
| Column | Source |
|--------|--------|
| Subject | `inbox_emails.subject` |
| From | `inbox_emails.forwarded_by_address` |
| To | `inbox_emails.to_address` |
| Status | `inbox_emails.status` — badge: `received` (gray), `processing` (blue), `processed` (green), `failed` (red), `needs_review` (yellow) |
| Error | `inbox_emails.processing_error` — shown inline for failed emails |
| Received | `inbox_emails.created_at` — relative timestamp |

**List actions:**
- **Reprocess** — triggers `/api/inbox_ops/emails/{id}/reprocess` for failed/needs_review emails
- **View proposal** — link to the proposal detail page for processed emails

**Detail view:**
- Email metadata (from, to, subject, message ID, received at)
- Raw email content (text + HTML preview toggle)
- Thread messages (parsed)
- Processing status + error (if any)
- Link to generated proposal (if exists)

**API:** The endpoints already exist:
- `GET /api/inbox_ops/emails` — list (needs pagination)
- `GET /api/inbox_ops/emails/{id}` — detail
- `POST /api/inbox_ops/emails/{id}/reprocess` — retry extraction

**Files:**
- `packages/core/src/modules/inbox_ops/backend/emails/page.tsx` — new list page
- `packages/core/src/modules/inbox_ops/backend/emails/[id]/page.tsx` — new detail page
- `packages/core/src/modules/inbox_ops/widgets/injection-table.ts` — add sidebar menu item for "Emails" under InboxOps
- `packages/core/src/modules/inbox_ops/i18n/en.json` — translations

---

## PR 6: Add local development guide for Resend + ngrok

**Type:** Documentation
**Priority:** Medium

**Problem:**
There is no documentation on how to set up InboxOps for local development with a real email provider. The `INBOX_OPS_*` env vars in `.env.example` have no usage instructions.

**Proposed fix:**
Add a section to the InboxOps module README or the main docs covering:
- Resend account setup + inbound receiving
- ngrok tunnel configuration
- Required env vars (with correct names)
- Database inbox address update
- Testing workflow
- Troubleshooting table

**Reference:** `INBOX-LOCAL-SETUP.md` in hackathon repo can serve as the basis.

**Files:**
- `packages/core/src/modules/inbox_ops/README.md` — add "Local Development" section
- Or `apps/docs/docs/framework/modules/inbox-ops.mdx` — if module docs site exists

---

## PR 7: Interactive CLI wizard — `yarn mercato inbox setup`

**Type:** New feature
**Priority:** High — eliminates the entire manual setup flow

**Problem:**
Setting up InboxOps locally requires 6 manual steps across 4 different systems (Resend dashboard, ngrok terminal, `.env` file, psql). Each step has a non-obvious gotcha (wrong env var name, domain mismatch, forgotten DB update). Even with documentation, users misconfigure it and waste time debugging silent failures.

The goal: make it so straightforward that you cannot mess it up ("nie da się tego speridolić").

**Proposed solution:**
An interactive CLI command that walks the user through the entire setup step by step, validates each input in real time, and writes all configuration automatically.

```bash
yarn mercato inbox setup
```

**Wizard flow:**

```
$ yarn mercato inbox setup

  ┌─────────────────────────────────────────┐
  │  InboxOps Setup Wizard                  │
  └─────────────────────────────────────────┘

  This wizard will configure email reception for InboxOps.
  You'll need a Resend account (https://resend.com — free tier works).

  Step 1/5 — Resend API Key
  ─────────────────────────
  Paste your Resend API key (starts with re_):
  > re_xxxxxxxxxxxx
  ✓ API key valid (verified against Resend API)

  Step 2/5 — Inbound Email Domain
  ────────────────────────────────
  What is your Resend receiving domain?
  (Find it in Resend → Emails → Receiving tab)
  > eiolduuamb.resend.app
  ✓ Domain format valid

  Step 3/5 — Webhook Tunnel
  ─────────────────────────
  InboxOps needs a public URL so Resend can reach your local server.

  ? How do you want to expose your local server?
    ❯ ngrok (recommended)
      Cloudflare Tunnel
      I already have a public URL

  [if ngrok selected:]
  ? Is ngrok installed and authenticated?
    ❯ Yes
      No — install it for me (brew install ngrok)

  Starting ngrok tunnel on port 3000...
  ✓ Tunnel active: https://abc123.ngrok-free.app

  Step 4/5 — Resend Webhook
  ─────────────────────────
  Now configure the webhook in Resend:

  1. Go to https://resend.com/webhooks
  2. Click "Add Webhook"
  3. Endpoint URL: https://abc123.ngrok-free.app/api/inbox_ops/webhook/inbound
     (copied to clipboard)
  4. Select event: email.received
  5. Save and copy the signing secret

  Paste the webhook signing secret (starts with whsec_):
  > whsec_xxxxxxxxxxxx
  ✓ Secret format valid

  Step 5/5 — AI Provider
  ──────────────────────
  InboxOps uses AI to extract actions from emails.

  ? Select your AI provider:
    ❯ Anthropic (Claude)
      OpenAI (GPT)
      Google (Gemini)
      Skip — I'll configure later

  [if Anthropic selected:]
  Paste your Anthropic API key (starts with sk-ant-):
  > sk-ant-xxxxxxxxxxxx
  ✓ API key valid (verified against Anthropic API)

  ═══════════════════════════════════════════

  Writing configuration...
  ✓ .env updated (RESEND_API_KEY, RESEND_WEBHOOK_SIGNING_SECRET,
    INBOX_OPS_DOMAIN, ANTHROPIC_API_KEY)
  ✓ inbox_settings updated (ops-ed7b5b8f@eiolduuamb.resend.app)

  ═══════════════════════════════════════════

  ✅ InboxOps is ready!

  Send an email to: ops-ed7b5b8f@eiolduuamb.resend.app
  View proposals at: http://localhost:3000/backend/inbox_ops

  Note: If you restart ngrok, run "yarn mercato inbox update-webhook"
  to update the tunnel URL.
```

**Key design principles:**

1. **Validate every input immediately** — don't let the user proceed with a bad API key or malformed domain. Hit the Resend API to verify the key works. Check the Anthropic/OpenAI key with a lightweight API call.

2. **Write all config automatically** — the wizard writes `.env` vars and updates `inbox_settings` in the DB. No manual editing.

3. **Copy-paste the webhook URL** — put it on the clipboard so the user just pastes it into Resend. One less thing to mistype.

4. **Detect existing config** — if `.env` already has `RESEND_API_KEY`, offer to keep or replace. If `inbox_settings` already has a record, update it instead of inserting.

5. **Handle ngrok lifecycle** — optionally start ngrok as a subprocess, detect when the URL changes, offer `yarn mercato inbox update-webhook` to re-sync.

**Subcommands:**

| Command | Purpose |
|---------|---------|
| `yarn mercato inbox setup` | Full interactive wizard |
| `yarn mercato inbox status` | Show current config: inbox address, domain match, API key presence, tunnel status |
| `yarn mercato inbox update-webhook` | Update webhook URL after ngrok restart (re-syncs `inbox_settings` domain) |

**Implementation approach:**

- Use `@inquirer/prompts` for the interactive wizard (already a common dep in Node CLI tools)
- CLI entry point: `packages/core/src/modules/inbox_ops/cli/inbox-setup.ts`
- Register as a mercato CLI command via the module's CLI registration
- API key validation: `fetch('https://api.resend.com/domains', { headers: { Authorization: 'Bearer re_...' } })` — 200 = valid
- Anthropic key validation: lightweight `/v1/messages` call with minimal payload
- `.env` writing: read file, find/replace or append vars, preserve comments
- DB update: use the same MikroORM bootstrap as other CLI commands

**Files:**
- `packages/core/src/modules/inbox_ops/cli/inbox-setup.ts` — wizard logic
- `packages/core/src/modules/inbox_ops/cli/inbox-status.ts` — status checker
- `packages/core/src/modules/inbox_ops/cli/inbox-update-webhook.ts` — webhook URL updater
- `packages/core/src/modules/inbox_ops/cli/index.ts` — CLI command registration
- `packages/core/src/modules/inbox_ops/lib/validateResendKey.ts` — Resend API key validator
- `packages/core/src/modules/inbox_ops/lib/validateAiKey.ts` — AI provider key validator
- `packages/core/src/modules/inbox_ops/lib/envWriter.ts` — safe `.env` file updater

---

## Changelog

### 2026-04-12
- PR 1: added `AiAssistantSettingsPageClient.tsx` to file list — hardcoded fallback shows wrong env var name (`OPENCODE_ANTHROPIC_API_KEY` instead of `ANTHROPIC_API_KEY`)
- PR 1: corrected `.env.example` path to `packages/create-app/template/.env.example`

### 2026-04-11
- Initial draft — 6 PRs identified from local dev setup friction
- Added PR 7 — interactive CLI wizard (`yarn mercato inbox setup`) to eliminate manual setup entirely
- PR 1-2 are bug fixes, PR 3-4 are DX improvements, PR 5-7 are new features, PR 6 is docs
