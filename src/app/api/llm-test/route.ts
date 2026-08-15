import { NextResponse } from "next/server";
import { getLLM } from "@/lib/pipeline/llm";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  const start = Date.now();
  try {
    const zai = await getLLM();
    const initTime = Date.now() - start;
    const callStart = Date.now();
    const resp = await zai.chat.completions.create({
      model: "glm-4-flash",
      messages: [
        { role: "system", content: "Return the word PONG only." },
        { role: "user", content: "ping" },
      ],
      temperature: 0,
    });
    const callTime = Date.now() - callStart;
    return NextResponse.json({
      ok: true,
      initTimeMs: initTime,
      callTimeMs: callTime,
      totalTimeMs: Date.now() - start,
      response: resp?.choices?.[0]?.message?.content,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message,
      totalTimeMs: Date.now() - start,
    }, { status: 500 });
  }
}
