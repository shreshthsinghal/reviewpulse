// ReviewPulse -- PII scrubbing.
// Spec S4.3: two passes.
//   1. Deterministic regex strip of emails, phone numbers, @handles,
//      long numeric strings (order/transaction/account IDs), and
//      "my name is ___ / I am ___" name patterns.
//   2. LLM verification pass -- only on the 3 quotes selected for the final
//      note (cheap). Flag and redact or reject + pick next-best candidate.
//
// CRITICAL: every export path (note, email, CSV) runs scrubbing. We never
// assume it was already done upstream.

import { getLLM, withRetry } from "./llm";
import type { Quote, Review } from "./types";

const REDACTED = "[redacted]";

// Order matters: emails and URLs first (so phone regex doesn't mangle them),
// then phones, then @handles, then long numeric IDs, then name patterns.
const DETERMINISTIC_RULES: Array<{ re: RegExp; replacement: string }> = [
  // emails
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: REDACTED },
  // URLs with http/https (we keep bare hostnames, which are fine)
  { re: /https?:\/\/[^\s)]+/gi, replacement: REDACTED },
  // international phone numbers (+91, +1, etc.) and Indian / US formats
  { re: /\+?\d[\d\s\-().]{8,}\d/g, replacement: REDACTED },
  // @handles (Twitter-style)
  { re: /(^|\s)@[\w._-]+/g, replacement: `$1${REDACTED}` },
  // long numeric strings (8+ digits) -- looks like account/order/transaction IDs
  { re: /\b\d{8,}\b/g, replacement: REDACTED },
  // short transaction-style IDs like TXN12345678 or ORD-AB12345
  { re: /\b(?:TXN|ORD|ACC|CN|REF|UTR|RRN)[-_]?\w{4,}\b/gi, replacement: REDACTED },
  // "my name is X" / "I am X" / "this is X" patterns
  { re: /\b(?:my name is|i am|i'm|this is)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b/g, replacement: REDACTED },
];

export function scrubDeterministic(input: string): string {
  let out = input;
  for (const rule of DETERMINISTIC_RULES) {
    out = out.replace(rule.re, rule.replacement);
  }
  return out;
}

export function scrubReviewDeterministic(r: Review): Review {
  return {
    ...r,
    title: r.title ? scrubDeterministic(r.title) : r.title,
    text: scrubDeterministic(r.text),
  };
}

export function scrubReviews(reviews: Review[]): Review[] {
  return reviews.map(scrubReviewDeterministic);
}

// LLM verification pass -- only on the final 3 quotes.
// Returns the same quotes with any remaining PII-shaped text redacted,
// or `null` for a quote the model says should be rejected entirely.
export async function llmVerifyQuotes(
  quotes: Quote[]
): Promise<(Quote | null)[]> {
  if (quotes.length === 0) return [];
  const zai = await getLLM();
  const sys =
    "You are a PII verification pass. Given a small array of user quotes (already deterministically scrubbed), " +
    "flag any REMAINING personally identifying information: actual names of users, actual emails, actual phone numbers, actual @handles, actual account/order/transaction IDs (numbers or alphanumeric codes), actual street addresses. " +
    "Do NOT redact generic words like 'account', 'money', 'funds', 'app', 'bank', 'card' -- these are not PII. " +
    "Do NOT redact references to document TYPES ('Aadhaar', 'PAN', 'KYC', 'UPI', 'IMPS') unless the actual NUMBER is present. " +
    "Do NOT redact monetary amounts ('5000', 'Rs 1000') -- these are not PII either. " +
    "For each quote, return STRICT JSON: an array of objects with fields { index: int, action: 'keep' | 'redact' | 'reject', redacted_text: string|null }. " +
    "Use 'redact' with redacted_text where the quote is good but contains a residual PII fragment -- replace ONLY the PII with '[redacted]', keep the rest verbatim. " +
    "Use 'reject' only if the quote is mostly personal info or unsafe to publish. " +
    "When in doubt, prefer 'keep' -- over-redaction is also a quality problem.";
  const resp = await withRetry(() =>
    zai.chat.completions.create({
      model: "glm-4-flash",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: JSON.stringify(
            quotes.map((q, i) => ({
              index: i,
              theme: q.theme,
              rating: q.rating,
              text: q.text,
            }))
          ),
        },
      ],
      temperature: 0.1,
    })
  );
  const content = resp?.choices?.[0]?.message?.content ?? "[]";
  let arr: any[] = [];
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) arr = [];
  } catch {
    arr = [];
  }
  return quotes.map((q, i) => {
    const entry = arr.find((x) => x?.index === i);
    if (!entry) return q; // assume keep if not present
    if (entry.action === "reject") return null;
    if (entry.action === "redact" && typeof entry.redacted_text === "string") {
      return { ...q, text: entry.redacted_text };
    }
    return q;
  });
}
