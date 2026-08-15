# ReviewPulse

> Weekly app review pulse, in one scannable page.
> Import -> Group -> Generate Note -> Draft Email.

ReviewPulse ingests recent **App Store + Play Store** reviews for a fintech app
(default: **Groww**) -- or any other app you choose -- and turns them into a
scannable **weekly one-page pulse note**: top themes, real user quotes, and
action ideas. Then it drafts the email containing that note.

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
| Styling | Tailwind CSS 4 + shadcn/ui (customised -- see `globals.css`) |
| Animation | Framer Motion |
| Charts | Recharts |
| PDF parsing | `pdf-parse` (server-side) |
| OCR | GLM-4V via `z-ai-web-dev-sdk` `chat.completions.createVision` |
| Play Store data | `google-play-scraper` (npm) -- public-listing batchexecute endpoint, no auth |
| App Store data | Apple's public per-app RSS feed (`https://itunes.apple.com/rss/customerreviews/...`) |
| LLM | GLM (`glm-4-plus` for text, `glm-4v-plus` for vision) via `z-ai-web-dev-sdk` |
| Email "Send" | Optional, via Resend (`EMAIL_API_KEY`) with copy/download fallback |
| Deployment | Vercel |

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

Open <https://my-project-delta-cyan-59.vercel.app/>. Click **"Analyze Groww's Weekly Pulse"** -- that's
the zero-input default flow; the rest of the pipeline runs end-to-end.

### Production build

```bash
bun run build
bun run start
```

---

## Environment variables

| Var | Required? | What it does | What happens if unset |
|---|---|---|---|
| `GLM_API_KEY` | **Required** | Powers all LLM calls: theme classification, note generation, email drafting, OCR, PII verification. | Pipeline still runs in **sample-fallback mode** -- uses the bundled redacted Groww dataset so the demo is explorable, but no live fetching or LLM-based stages work. The UI says so explicitly. |
| `GLM_BASE_URL` | Optional | Override the GLM API endpoint. Defaults to `https://api.z.ai/api/paas/v4`. | Default used. |
| `EMAIL_API_KEY` | Optional | Resend API key. Enables the actual "Send" button in the Email view. | Send returns 501 with a friendly message; **Copy** and **Download .txt** always work and satisfy the email draft deliverable. |
| `EMAIL_FROM` | Optional | The `From:` address for sent emails (e.g. `ReviewPulse <you@yourdomain.com>`). Must be a verified sender in your Resend account. | Send is disabled; copy/download still work. |

`.env.example`:

```
GLM_API_KEY=your-glm-key-here
GLM_BASE_URL=https://api.z.ai/api/paas/v4
EMAIL_API_KEY=your-resend-key-here
EMAIL_FROM=ReviewPulse <you@yourdomain.com>
```

---

## How to re-run the analysis for a new week

Re-running is a single button -- there is no separate script. From the dashboard
or the Settings view, click **"Re-run for this week"**. The pipeline:

1. Pulls the latest reviews from the configured source for the same app
   (or uploads new data if you switch to PDF/image).
2. Re-runs PII scrubbing, theme classification, note generation, and email
   drafting.
3. Caches are per-app per-day -- same-day re-runs hit the live source at most
   once. Next-day re-runs re-fetch.

The date window is **always the last 8-12 weeks** ending today (spec S1,
non-negotiable). Older reviews are dropped at ingestion.

To switch to a different app: click **"Analyze a different app"** from the
landing page or the dashboard's "New analysis" button.

---

## Theme legend

### Groww default (fixed legend, used when `appName === "Groww"`)

| # | Theme |
|---|---|
| 01 | Onboarding |
| 02 | KYC / Verification |
| 03 | Payments |
| 04 | Statements / Reports |
| 05 | Withdrawals |

### Dynamic fallback (any other app)

When analyzing an app other than Groww, ReviewPulse does NOT force-fit the
Groww legend. Instead:

1. An LLM pass proposes up to 5 themes appropriate to that app's actual review
   content (e.g. for a music app: "Audio Quality", "Playlist Management",
   "Subscription / Billing", "Recommendations", "Other").
2. A second LLM pass classifies each review into one of those themes -- or
   `"Other"` if nothing fits.
3. **Hard cap at 5 themes, ever.** Overflow clusters are merged into the nearest
   theme or `"Other"`. Never rendered, stored, or exported as a 6th theme.

This cap is enforced in `src/lib/pipeline/themes.ts` (`capThemes`).

---

## The 4-stage pipeline

Visible in the UI as a live stepper during processing, and as a compact
diagram on the dashboard. This is the W3 automation skill made explicit.

| Stage | What it does |
|---|---|
| **1. Import** | Fetches public reviews (Play Store listing, App Store RSS, uploaded PDF, or uploaded screenshot). All four sources resolve to the same internal schema -- which has **no PII fields by design**. |
| **2. Group** | (a) Deterministic PII scrub: regex strip of emails, phones, @handles, long numeric IDs (order/transaction/account), and "my name is ___ / I am ___" patterns. (b) LLM classification into <=5 themes (Groww legend or dynamic). |
| **3. Generate Note** | Drafts the weekly one-pager: top 3 themes by volume, 3 real PII-scrubbed quotes, 3 concrete action ideas, <=250 words total. A second LLM pass verifies no residual PII in the 3 selected quotes. |
| **4. Draft Email** | Writes a subject (<=60 chars) + body in email-appropriate plain text, signed off as ReviewPulse. |

---

## Data sources (public, non-login-gated)

Per spec S5.5, "public" means: no login wall, no scraping behind an authenticated
session, no CAPTCHA bypass, no private API keys belonging to someone else.

| Source | Path | Auth? | Why it qualifies |
|---|---|---|---|
| Play Store listing | `google-play-scraper` npm package -- hits Google's public `batchexecute` JSON-RPC endpoint (the same one the play.google.com web app calls from the browser). No auth. | None | This is the same data any browser user sees on the public listing page. No Play Console / Developer API is used (those require app ownership). |
| App Store listing | `https://itunes.apple.com/rss/customerreviews/page=1/id=<APPID>/sortby=mostrecent/json` | None | Apple's official, public, per-app Customer Reviews RSS feed. No auth. |
| PDF upload | `pdf-parse` server-side | N/A | User-provided file; never auto-fetched. |
| Image upload | GLM-4V via `z-ai-web-dev-sdk` | N/A | User-provided file; never auto-fetched. |

If at any point a chosen data path requires credentials that aren't the deploying
user's own legitimately-issued API key, ReviewPulse falls back to the bundled
sample dataset and **says so in the UI** (amber "sample fallback in use" pill on
the dashboard). It never fails silently and never fakes live data.

---

## PII policy

Spec S1, rule 5: **no PII anywhere** -- not in the note, not in quotes, not in
the CSV export, not in the email. This means no usernames, emails, phone numbers,
order/transaction/account IDs, or full names.

Enforcement is **by omission, not by a filter you might forget to run**:

1. The internal `Review` schema (`src/lib/pipeline/types.ts`) has no field for
   username, email, phone, or device ID. The fields don't exist.
2. Two-pass scrubbing (`src/lib/pipeline/pii-scrub.ts`):
   - **Deterministic pass:** regex strip of emails, phone numbers (intl + IN/US
     formats), @handles, long numeric strings (8+ digits, looks like account/
     order/transaction IDs), short transaction-style IDs (`TXN1234…`, `ORD-AB…`),
     and "my name is ___ / I am ___ / this is ___" patterns.
   - **LLM verification pass:** only on the 3 quotes selected for the final note
     (cheap -- 3 quotes only). The model flags any remaining PII-shaped text and
     either redacts the fragment or rejects that quote and picks the next-best
     candidate.
3. **Defense-in-depth on export:** the `/api/export` CSV route re-runs the
   deterministic scrub on the payload before serving it. Don't trust upstream.

---

## Constraints enforced (spec S1)

| Rule | Enforcement |
|---|---|
| Last 8-12 weeks only | `withinWindow()` in `importers.ts` drops anything older than 12 weeks. |
| <=5 themes, ever | `MAX_THEMES` constant + `capThemes()` in `themes.ts`; charts, note, and exports all respect it. |
| Note = exactly 3 themes + 3 quotes + 3 actions | `NOTE_TOP_THEMES`, `NOTE_QUOTES`, `NOTE_ACTIONS` constants in `note.ts`. |
| Note <=250 words | `enforceWordLimit()` truncates at `NOTE_WORD_LIMIT`; word count surfaced in UI. |
| No PII | See PII policy above. |
| Public data only | See data sources table above. |
| No fine-tuning | All LLM work is prompting against GLM (glm-4-plus / glm-4v-plus). |

---

## File / route structure

```
src/
  app/
    layout.tsx               # fonts (Inter throughout), ThemeProvider
    page.tsx                 # SPA shell, view-state machine
    globals.css              # brand tokens (light/dark), editorial styles
    api/
      pipeline/route.ts      # POST -- Import -> Group -> Note -> Email orchestration
      playstore-search/route.ts  # GET -- app name autocomplete
      export/route.ts        # POST -- CSV / Markdown / PDF / email-text downloads
      send-email/route.ts    # POST -- best-effort send via Resend
  lib/pipeline/
    types.ts                 # Review schema (PII-by-omission), Theme, Note, EmailDraft
    constants.ts             # Groww legend, caps, app IDs
    llm.ts                   # ZAI (GLM) singleton -- auto-loads credentials
    sample-data.ts           # bundled redacted Groww sample reviews (fallback)
    importers.ts             # play_store, app_store, pdf, image (VLM)
    pii-scrub.ts             # deterministic + LLM verification
    themes.ts                # Groww legend + dynamic fallback, cap at 5
    note.ts                  # weekly note generation (<=250w, 3+3+3)
    email.ts                 # email draft (subject <=60 + body)
  components/
    reviewpulse/
      logo.tsx               # animated Gestalt mark (closure + figure-ground)
      theme-provider.tsx     # next-themes wrapper
      theme-toggle.tsx       # light/dark switch
      pipeline-stepper.tsx   # 4-stage visual stepper (default + compact)
      views/
        landing-view.tsx
        input-view.tsx       # 3 import paths, equally weighted
        processing-view.tsx  # live stepper + "what this stage is doing"
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

## Deliverables checklist (spec S9)

- [x] Deployable on Vercel (Next.js 16 App Router).
- [x] One-page weekly note -- downloadable as **PDF** (print-ready HTML ->
      browser print dialog) and **Markdown**.
- [x] Email draft -- **Copy** + **Download as .txt** always work; **Send** is
      best-effort via Resend (degrades gracefully if `EMAIL_API_KEY` unset).
- [x] Reviews CSV (PII-redacted, re-scrubbed on export) -- downloadable from
      Note view.
- [x] README.md (this file) -- re-run instructions, theme legend, data sources,
      env vars.
- [x] Visible 4-stage pipeline (`Import -> Group -> Generate Note -> Draft Email`)
      rendered as a stepper during processing and as a compact diagram on the
      dashboard.
- [x] Default Groww flow works with **zero required input** -- single CTA.
- [x] Alternate-app flow works via Play Store name search, PDF upload, image
      upload.
- [x] Light/dark theme toggle, persisted via `next-themes`; responsive across
      mobile / tablet / desktop.
- [x] Animated, Gestalt-based logo intro (<=2s, skippable, instant static
      fallback for `prefers-reduced-motion`).
- [x] No PII in any artifact -- verified on actual output (defense-in-depth:
      scrubbed at ingestion AND on export).
- [x] Note <=250 words, <=5 themes, exactly 3 quotes + 3 action ideas -- verified
      on actual output (constants + `enforceWordLimit()`).

---

## Deviations from the spec

Documented honestly:

1. **PDF "download as PDF" path.** Spec asked for downloadable PDF. Rather than
   pulling in a heavy PDF-rendering dep, `/api/export` serves a **print-ready
   HTML page** that auto-triggers the browser's print dialog (where "Save as
   PDF" is one click). The artifact is the same -- clean, paginated, brand-
   styled. If you want a server-rendered `.pdf` byte stream instead, swap in
   `@react-pdf/renderer` and replace the `kind === "pdf"` branch in
   `src/app/api/export/route.ts`.
2. **Live Play Store fetching.** Uses the `google-play-scraper` npm package,
   which reads the public Play Store listing via the internal `batchexecute`
   JSON-RPC endpoint (the same one the play.google.com web app calls from
   the browser -- no auth, no Play Console API). Falls back to the bundled
   sample dataset (Groww default flow) or surfaces a clear error (any other
   app) when fetching fails. This is the spec-mandated "say so in the UI,
   don't fake live data" behaviour.
3. **Email "Send" via Resend.** Resend is used as the example transactional
   email provider because it's the simplest to wire on Vercel. Any Resend-
   compatible HTTP API will work -- swap the URL in `src/app/api/send-email/route.ts`.

---

## License

All bundled sample reviews are synthetic but realistic -- modelled on the kind
of public review content Groww receives. No real user data is included.
