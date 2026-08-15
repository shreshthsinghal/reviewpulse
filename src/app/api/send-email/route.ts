// POST /api/send-email
// Body: { to, subject, body }
// Best-effort send via Resend (or similar) if EMAIL_API_KEY + EMAIL_FROM are set.
// Otherwise returns 501 with a friendly message so the client can fall back
// to copy/download. NEVER blocks the core deliverable.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return NextResponse.json(
      {
        error:
          "EMAIL_API_KEY / EMAIL_FROM not set on this deployment. Copy or Download the draft instead -- both satisfy the deliverable.",
      },
      { status: 501 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const to = (body?.to ?? "").toString();
  const subject = (body?.subject ?? "").toString().slice(0, 60);
  const text = (body?.body ?? "").toString();

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Email API returned ${res.status}: ${errText}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
