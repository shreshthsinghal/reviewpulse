# ReviewPulse

> Weekly Groww review pulse, in one scannable page.
> Import > Group > Generate Note > Draft Email.

ReviewPulse fetches the last 8-12 weeks of public Play Store reviews for
**Groww**, groups them into <=5 themes, drafts a <=250-word weekly note with
3 real quotes and 3 action ideas, and writes the email for you. Real-time --
runs fresh every time you open it.

The product is built around two skill sets, both made **visibly true** in the UI:

- **LLMs & Prompting:** summarization quality, quote selection judgment,
  tone control.
- **AI Workflow Automation:** a clean, visible 4-stage pipeline --
  `Import > Group > Generate Note > Draft Email` -- rendered as a first-class
  UI concept, not just backend plumbing.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (customised) |
| Animation | Framer Motion |
| Charts | Recharts |
| Play Store data | `google-play-scraper` (npm) -- public-listing batchexecute endpoint, no auth |
| LLM | GLM `glm-4.5-flash` via `z-ai-web-dev-sdk` |
| Email "Send" | Optional, via Resend (`EMAIL_API_KEY`) with copy/download fallback |
| Deployment | Vercel (Hobby tier -- pipeline split into 4 stages, each under the 10s function timeout) |

---

## Quick start

```bash
# 1. install
bun install

# 2. configure env (see below)
cp .env.example .env   # then edit .env

# 3. dev server
bun run dev
```

Open <http://localhost:3000>. Click **"Analyze Groww's Weekly Pulse"** -- the
full 4-stage pipeline runs end-to-end against live Play Store reviews.

---

## Environment variables

| Var | Required? | What it does | What happens if unset |
|---|---|---|---|
| `GLM_API_KEY` | **Required** | Powers all LLM calls: theme classification, note generation, email drafting, PII verification. Get one from https://z.ai/. | Pipeline returns a clear 503 error explaining how to set it. |
| `GLM_BASE_URL` | Optional | Override the GLM API endpoint. Defaults to `https://api.z.ai/api/paas/v4`. | Default used. |
| `EMAIL_API_KEY` | Optional | Resend API key. Enables the actual "Send" button in the Email view. | Send returns 501 with a friendly message; **Copy** and **Download .txt** always work. |
| `EMAIL_FROM` | Optional | The `From:` address for sent emails. Must be a verified sender in your Resend account. | Send is disabled; copy/download still work. |

`.env.example`:

```
GLM_API_KEY=your-api-key-here
GLM_BASE_URL=https://api.z.ai/api/paas/v4
EMAIL_API_KEY=your-resend-key-here
EMAIL_FROM=ReviewPulse <you@yourdomain.com>
```

---

## How it works (real-time)

Every time you click **"Analyze Groww's Weekly Pulse"**, the pipeline runs
fresh -- no cached data, no sample fallback. The 4 stages run as 4 separate
API endpoints (each fits within Vercel Hobby tier's 10s function timeout):

| Stage | Endpoint | What it does | Vercel timing |
|---|---|---|---|
| **1. Import** | `/api/pipeline-import` | Fetches the newest ~150 public Play Store reviews for Groww via `google-play-scraper`. Drops anything older than 12 weeks. The internal `Review` schema has no PII fields by design. | ~1.5s |
| **2. Group** | `/api/pipeline-group` | (a) Deterministic PII scrub: regex strip of emails, phones, @handles, long numeric IDs, name patterns. (b) LLM proposes up to 5 themes appropriate to the actual review content AND classifies each review into one of them -- in a single LLM call. Hard cap at 5 themes. | ~6s |
| **3. Generate Note** | `/api/pipeline-note` | Drafts the weekly one-pager: top 3 themes by volume, 3 real PII-scrubbed quotes, 3 action ideas, <=250 words. A second LLM pass verifies no residual PII in the 3 selected quotes. | ~8s |
| **4. Draft Email** | `/api/pipeline-email` | Writes a subject (<=60 chars) + body in email-appropriate plain text. | ~6s |

The frontend calls them sequentially, updating the 4-stage stepper UI in
real time as each stage completes. Total end-to-end time: ~22s.

If you open the app next week, next month, or in 3 months, the date window
moves with you -- always the last 8-12 weeks ending today.

---

## Theme discovery

The pipeline uses **dynamic theme discovery** -- the LLM looks at the
actual review content and proposes up to 5 themes that fit what users are
saying (e.g. "Trading Experience", "General Satisfaction", "App Interface",
"Account Features", "Other"). Hard cap at 5 themes, ever.

This works better than the spec's original Groww fixed legend
(Onboarding / KYC / Verification / Payments / Statements / Reports /
Withdrawals) because that legend doesn't match what real Groww users
complain about -- 99% of reviews landed in "Other" with it. Dynamic themes
produce a much more useful pulse.

---

## PII policy

**No PII anywhere** -- not in the note, not in quotes, not in the CSV export,
not in the email. This means no usernames, emails, phone numbers,
order/transaction/account IDs, or full names.

Enforcement is **by omission, not by a filter you might forget to run**:

1. The internal `Review` schema (`src/lib/pipeline/types.ts`) has no field
   for username, email, phone, or device ID. The fields don't exist.
2. Two-pass scrubbing (`src/lib/pipeline/pii-scrub.ts`):
   - **Deterministic pass:** regex strip of emails, phone numbers,
     @handles, long numeric strings, transaction-style IDs, name patterns.
   - **LLM verification pass:** only on the 3 quotes selected for the final
     note (cheap). Flags any remaining PII-shaped text and either redacts
     the fragment or rejects that quote.
3. **Defense-in-depth on export:** the `/api/export` CSV route re-runs the
   deterministic scrub on the payload before serving it.

---

## Constraints enforced

| Rule | Enforcement |
|---|---|
| Last 8-12 weeks only | `withinWindow()` in `importers.ts` drops anything older than 12 weeks. |
| <=5 themes, ever | `MAX_THEMES` constant + `capThemes()` in `themes.ts`. |
| Note = exactly 3 themes + 3 quotes + 3 actions | `NOTE_TOP_THEMES`, `NOTE_QUOTES`, `NOTE_ACTIONS` constants. |
| Note <=250 words | `enforceWordLimit()` truncates at `NOTE_WORD_LIMIT`; word count surfaced in UI. |
| No PII | See PII policy above. |
| Public data only | Play Store public listing via `google-play-scraper`. No auth. |
| No fine-tuning | All LLM work is prompting against GLM (`glm-4.5-flash`). |

---

## File / route structure

```
src/
  app/
    layout.tsx               # fonts (Inter), ThemeProvider
    page.tsx                 # SPA shell, view-state machine
    globals.css              # brand tokens (light/dark)
    api/
      pipeline-import/route.ts  # POST -- Stage 1: fetch live Play Store reviews
      pipeline-group/route.ts   # POST -- Stage 2: PII scrub + theme classification
      pipeline-note/route.ts    # POST -- Stage 3: generate weekly note
      pipeline-email/route.ts   # POST -- Stage 4: draft email
      export/route.ts          # POST -- CSV / Markdown / PDF / email-text downloads
      send-email/route.ts       # POST -- best-effort send via Resend
  lib/pipeline/
    types.ts                 # Review schema (PII-by-omission), Theme, Note, EmailDraft
    constants.ts             # Groww legend, caps, app IDs
    llm.ts                   # ZAI (GLM) singleton + withRetry helper
    importers.ts             # Play Store fetch (google-play-scraper)
    pii-scrub.ts             # deterministic + LLM verification
    themes.ts                # dynamic theme discovery + classification, cap at 5
    note.ts                  # weekly note generation (<=250w, 3+3+3)
    email.ts                 # email draft (subject <=60 + body)
    client-utils.ts          # client-safe chart data helpers
  components/
    reviewpulse/
      logo.tsx               # animated Gestalt mark
      theme-provider.tsx
      theme-toggle.tsx
      pipeline-stepper.tsx
      views/
        landing-view.tsx     # hero + CTA + pipeline diagram
        processing-view.tsx  # live stepper
        dashboard-view.tsx   # note pinned + 4 charts
        note-view.tsx        # one-pager, PDF/MD/CSV downloads
        email-view.tsx       # editable subject + body, copy/download/send
        settings-view.tsx    # re-run, how-it-works, theme legend
      charts/
        rating-trend.tsx
        theme-volume.tsx
        rating-distribution.tsx
        sentiment-donut.tsx
```

---

## Deliverables checklist

- [x] Deployed, working prototype on Vercel (Hobby tier).
      Live URL: https://my-project-psi-olive.vercel.app/
- [x] One-page weekly note -- downloadable as **PDF** (print-ready HTML) and
      **Markdown**.
- [x] Email draft -- **Copy** + **Download as .txt** always work; **Send** is
      best-effort via Resend.
- [x] Reviews CSV (PII-redacted, re-scrubbed on export).
- [x] README.md (this file) -- re-run instructions, theme legend, data sources,
      env vars.
- [x] Visible 4-stage pipeline (`Import > Group > Generate Note > Draft Email`)
      rendered as a stepper during processing.
- [x] Default Groww flow works with **zero required input** -- single CTA.
- [x] Light/dark theme toggle, persisted; responsive across mobile / tablet /
      desktop.
- [x] Animated, Gestalt-based logo intro (<=2s, skippable, instant static
      fallback for `prefers-reduced-motion`).
- [x] No PII in any artifact -- verified on actual output.
- [x] Note <=250 words, <=5 themes, exactly 3 quotes + 3 action ideas --
      verified on actual output.
- [x] Real-time: runs against live Play Store reviews every time, not cached
      sample data.

---

## License

All code is open source. The bundled sample reviews (no longer used in the
live flow but kept in git history for reference) were synthetic.
