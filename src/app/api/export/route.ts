// POST /api/export
// Body: { kind: "csv" | "markdown" | "pdf" | "email_text", payload: ... }
// Returns a downloadable file (or text/plain body) for the requested artifact.
// PII scrubbing is re-run here on the CSV path per spec S4.3 -- exports do NOT
// assume upstream scrubbing.

import { NextRequest, NextResponse } from "next/server";
import type { EmailDraft, PipelineResult, Review, WeeklyNote } from "@/lib/pipeline/types";
import { scrubReviews } from "@/lib/pipeline/pii-scrub";

export const runtime = "nodejs";
export const maxDuration = 30;

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function reviewsToCsv(reviews: Review[]): string {
  const safe = scrubReviews(reviews); // defense-in-depth on export
  const header = ["id", "source", "rating", "title", "text", "date", "theme"];
  const rows = safe.map((r) =>
    [r.id, r.source, r.rating, r.title ?? "", r.text, r.date, r.theme ?? "Other"]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function noteToMarkdown(note: WeeklyNote): string {
  const meta = `<!-- ReviewPulse weekly note for ${note.appName}, ${note.dateRange.start} > ${note.dateRange.end}. ${note.wordCount} words. -->\n\n`;
  return meta + note.markdown;
}

function noteToPlainTextEmail(email: EmailDraft): string {
  return `Subject: ${email.subject}\n\n${email.body}\n`;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body?.kind as string;
  const payload = body?.payload;

  if (kind === "csv") {
    const reviews = (payload?.reviews ?? []) as Review[];
    const csv = reviewsToCsv(reviews);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reviewpulse-reviews-${Date.now()}.csv"`,
      },
    });
  }

  if (kind === "markdown") {
    const note = payload?.note as WeeklyNote;
    if (!note) return NextResponse.json({ error: "missing note" }, { status: 400 });
    const md = noteToMarkdown(note);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="reviewpulse-note-${note.appName.toLowerCase().replace(/\s+/g, "-")}.md"`,
      },
    });
  }

  if (kind === "email_text") {
    const email = payload?.email as EmailDraft;
    if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });
    const txt = noteToPlainTextEmail(email);
    return new NextResponse(txt, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="reviewpulse-email-${Date.now()}.txt"`,
      },
    });
  }

  if (kind === "pdf") {
    // We render the note as a print-ready HTML page and let the client open
    // the print dialog (window.print). Server-side PDF generation would
    // require an extra dep; the spec accepts "downloadable as PDF" and the
    // print-to-PDF path produces a clean artifact. We serve a minimal HTML.
    const note = payload?.note as WeeklyNote;
    const result = payload?.result as PipelineResult | undefined;
    if (!note) return NextResponse.json({ error: "missing note" }, { status: 400 });
    const html = renderNotePrintableHtml(note, result);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="reviewpulse-note-${note.appName.toLowerCase().replace(/\s+/g, "-")}.html"`,
      },
    });
  }

  return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });
}

function renderNotePrintableHtml(note: WeeklyNote, result?: PipelineResult): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const renderMd = (md: string) => {
    return esc(md)
      .replace(/^## (.+)$/gm, '<h2 class="section">$1</h2>')
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "<br/><br/>");
  };
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>ReviewPulse -- ${esc(note.appName)} weekly pulse</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font: 14px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1C1C1E; background: #fff; max-width: 740px; margin: 0 auto; padding: 32px 0; }
  .mast { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #0E7C7B; padding-bottom: 8px; margin-bottom: 24px; }
  .brand { font-weight: 700; letter-spacing: -0.02em; font-size: 22px; }
  .brand .accent { color: #0E7C7B; }
  .meta { font-size: 12px; color: #6B6B6B; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2.section { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: #0E7C7B; border-top: 1px solid #E5E3DE; padding-top: 18px; margin-top: 24px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .footer { margin-top: 40px; border-top: 1px solid #E5E3DE; padding-top: 12px; font-size: 11px; color: #6B6B6B; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="mast">
    <div class="brand">Review<span class="accent">Pulse</span></div>
    <div class="meta">${esc(note.dateRange.start)} > ${esc(note.dateRange.end)} | ${note.wordCount} words | ${result?.meta.reviewCount ?? "--"} reviews</div>
  </div>
  <h1>${esc(note.appName)} -- Weekly Pulse</h1>
  <div class="meta">Top themes | real user quotes | action ideas</div>
  ${renderMd(note.markdown)}
  <div class="footer">Generated by ReviewPulse | Public review data only | PII-scrubbed</div>
  <script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`;
}
