// POST /api/pipeline-email
// Stage 4 of 4: Draft the email.
// Takes the weekly note from stage 3, returns the email draft.

import { NextRequest, NextResponse } from "next/server";
import type { WeeklyNote } from "@/lib/pipeline/types";
import { draftEmail } from "@/lib/pipeline/email";
import { hasLLMKey, isSandboxCredentials } from "@/lib/pipeline/llm";

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

  const canCallLLM = await hasLLMKey();
  const useRealLLM = canCallLLM && !isSandboxCredentials();

  if (!useRealLLM) {
    // Fallback: use the note markdown as the email body, with a simple subject.
    return NextResponse.json({
      email: {
        subject: `${note.appName} weekly review pulse`.slice(0, 60),
        body: note.markdown,
      },
      warning: isSandboxCredentials()
        ? "Using note markdown as email body (sandbox LLM credentials can't be used from Vercel)."
        : "Using note markdown as email body (GLM_API_KEY not set).",
    });
  }

  try {
    const email = await draftEmail(note);
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({
      email: {
        subject: `${note.appName} weekly review pulse`.slice(0, 60),
        body: note.markdown,
      },
      warning: "LLM email drafting failed -- using note markdown as fallback.",
    });
  }
}
