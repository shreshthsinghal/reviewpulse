// ReviewPulse — email draft generation.
// Spec §4.7: subject ≤60 chars, body presents the note content in email-
// appropriate formatting (not a re-summary of it). Neutral tone, no PII.

import { getLLM } from "./llm";
import { EMAIL_SUBJECT_LIMIT } from "./constants";
import type { EmailDraft, WeeklyNote } from "./types";

export async function draftEmail(note: WeeklyNote): Promise<EmailDraft> {
  const zai = await getLLM();
  const sys = `Write a short, professional email presenting a weekly product review pulse.
Input: the generated weekly note (markdown) for ${note.appName}, covering ${note.dateRange.start} to ${note.dateRange.end}.
Output: STRICT JSON ONLY of the form: {"subject": "...", "body": "..."}
Subject under ${EMAIL_SUBJECT_LIMIT} characters. Body should be email-formatted (short lines, no markdown syntax, plain text with line breaks), professional and neutral in tone, and must not introduce any PII. Do not restate every line of the note — present it cleanly as the email content. Sign off as "ReviewPulse" on its own line at the end of the body.`;
  const resp = await zai.chat.completions.create({
    model: "glm-4-plus",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: note.markdown },
    ],
    temperature: 0.4,
  });
  const content = resp?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      subject: `${note.appName} weekly review pulse`,
      body: note.markdown,
    };
  }
  const subject = (parsed.subject ?? "").toString().slice(0, EMAIL_SUBJECT_LIMIT);
  const body = (parsed.body ?? "").toString();
  return { subject, body };
}
