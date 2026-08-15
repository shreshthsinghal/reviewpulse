"use client";

import * as React from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  Send,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EmailDraft, PipelineResult } from "@/lib/pipeline/types";
import { EMAIL_SUBJECT_LIMIT } from "@/lib/pipeline/constants";

interface Props {
  result: PipelineResult;
  onBack: () => void;
}

export function EmailView({ result, onBack }: Props) {
  const { email: initialEmail, note } = result;
  const [email, setEmail] = React.useState<EmailDraft>(initialEmail);
  const [recipient, setRecipient] = React.useState("");
  const [busy, setBusy] = React.useState<"copy" | "txt" | "send" | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [sentStatus, setSentStatus] = React.useState<string | null>(null);

  async function copyToClipboard() {
    setBusy("copy");
    try {
      const text = `Subject: ${email.subject}\n\n${email.body}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } finally {
      setBusy(null);
    }
  }

  async function downloadTxt() {
    setBusy("txt");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "email_text", payload: { email } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reviewpulse-email-${slug(note.appName)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    if (!recipient.trim()) {
      setSentStatus("error: enter a recipient email first");
      return;
    }
    setBusy("send");
    setSentStatus(null);
    try {
      // Best-effort send via Resend if EMAIL_API_KEY is set on the server.
      // If not configured, we fall back gracefully to copy/download.
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: email.subject,
          body: email.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 501) {
          setSentStatus(
            "Send is not configured on this deployment (EMAIL_API_KEY missing). Use Copy or Download instead — both satisfy the deliverable."
          );
        } else {
          setSentStatus(`error: ${data?.error ?? "send failed"}`);
        }
      } else {
        setSentStatus("sent");
      }
    } catch (e: any) {
      setSentStatus(`error: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-8 pb-20">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </button>

      <h1 className="mt-6 font-display text-3xl sm:text-4xl font-bold tracking-tight">
        Email draft
      </h1>
      <p className="mt-2 text-muted-foreground">
        Subject + body pre-filled from the note. Editable. Copy &amp; download
        always work; Send is best-effort.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-[var(--surface)] p-5 sm:p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <Label htmlFor="to" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              To (your email / alias — self-send only)
            </Label>
            <Input
              id="to"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="you@yourcompany.com"
              className="mt-1.5 h-10"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="subj" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Subject
              </Label>
              <span className="font-mono text-[10px] text-muted-foreground">
                {email.subject.length} / {EMAIL_SUBJECT_LIMIT}
              </span>
            </div>
            <Input
              id="subj"
              value={email.subject}
              onChange={(e) =>
                setEmail({
                  ...email,
                  subject: e.target.value.slice(0, EMAIL_SUBJECT_LIMIT),
                })
              }
              className="mt-1.5 h-10"
              maxLength={EMAIL_SUBJECT_LIMIT}
            />
          </div>
          <div>
            <Label htmlFor="body" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Body
            </Label>
            <Textarea
              id="body"
              value={email.body}
              onChange={(e) => setEmail({ ...email, body: e.target.value })}
              className="mt-1.5 min-h-[320px] font-mono text-[13px] leading-relaxed resize-y"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button
            onClick={copyToClipboard}
            disabled={busy !== null}
            className="rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
          >
            {busy === "copy" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
          <Button
            variant="outline"
            onClick={downloadTxt}
            disabled={busy !== null}
            className="rounded-full"
          >
            {busy === "txt" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download .txt
          </Button>
          <Button
            variant="ghost"
            onClick={sendEmail}
            disabled={busy !== null}
            className="rounded-full"
          >
            {busy === "send" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send (best-effort)
          </Button>
          {sentStatus && (
            <div
              className={`ml-2 text-xs ${
                sentStatus === "sent"
                  ? "text-[var(--success)]"
                  : sentStatus.startsWith("error:")
                  ? "text-[var(--error)]"
                  : "text-muted-foreground"
              }`}
            >
              {sentStatus === "sent"
                ? "Email sent — check your inbox."
                : sentStatus.startsWith("error:")
                ? sentStatus.slice(6)
                : sentStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
