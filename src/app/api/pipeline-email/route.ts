// POST /api/pipeline-email
// Stage 4 of 4: Draft the email.
// Takes the weekly note from stage 3, returns the email draft.

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
  } catch {
    // Fallback: use the note markdown as the email body
    return NextResponse.json({
      email: {
        subject: `${note.appName} weekly review pulse`.slice(0, 60),
        body: note.markdown,
      },
      warning: "LLM email drafting failed -- using note markdown as fallback.",
    });
  }
}
