// POST /api/pipeline-email
// Stage 4 of 4: Draft the email.
// Fits within Vercel Hobby tier's 10s function timeout.

import { NextRequest, NextResponse } from "next/server";
import type { WeeklyNote } from "@/lib/pipeline/types";
import { draftEmail } from "@/lib/pipeline/email";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const note: WeeklyNote | undefined = body?.note;
  if (!note) {
    return NextResponse.json({ error: "Missing note" }, { status: 400 });
  }

  try {
    const email = await draftEmail(note);
    return NextResponse.json({ email });
  } catch (err) {
    return NextResponse.json({
      email: {
        subject: `${note.appName} weekly review pulse`.slice(0, 60),
        body: note.markdown,
      },
      warning: `LLM email drafting failed (${(err as Error).message}). Using note markdown as fallback.`,
    });
  }
}
