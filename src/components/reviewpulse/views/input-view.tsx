"use client";

import * as React from "react";
import { Search, FileText, Image as ImageIcon, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AppInput } from "@/lib/pipeline/types";

interface Props {
  onSubmit: (input: AppInput) => void;
  onBack: () => void;
  busy: boolean;
}

type Tab = "search" | "pdf" | "image";

interface SearchResult {
  appId: string;
  title: string;
  developer: string;
  score: number | null;
}

export function InputView({ onSubmit, onBack, busy }: Props) {
  const [tab, setTab] = React.useState<Tab>("search");
  const [appName, setAppName] = React.useState("");
  const [searchQ, setSearchQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selectedApp, setSelectedApp] = React.useState<SearchResult | null>(null);
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [imgFiles, setImgFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const searchAbort = React.useRef<AbortController | null>(null);

  // Debounced app-name search
  React.useEffect(() => {
    if (tab !== "search") return;
    if (searchQ.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      setError(null);
      searchAbort.current?.abort();
      searchAbort.current = new AbortController();
      try {
        const res = await fetch(
          `/api/playstore-search?q=${encodeURIComponent(searchQ)}`,
          { signal: searchAbort.current.signal }
        );
        // Read text first, parse JSON safely -- avoids "Unexpected token" if
        // the server returns HTML or empty body.
        const rawText = await res.text();
        let data: any = null;
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch {
            // Non-JSON response -- surface as error
            data = { error: `Server returned non-JSON response (${res.status})` };
          }
        }
        if (data?.error) {
          setError(data.error);
          setResults([]);
        } else {
          setResults(Array.isArray(data?.results) ? data.results : []);
        }
      } catch (e: any) {
        if (e.name === "AbortError") return;
        setError(e.message || "Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, tab]);

  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(f);
    });
  }

  async function handleSubmit() {
    setError(null);
    if (tab === "search") {
      if (!selectedApp) {
        setError("Pick an app from the search results first.");
        return;
      }
      onSubmit({
        kind: "playstore_search",
        appName: selectedApp.title,
        appId: selectedApp.appId,
      });
    } else if (tab === "pdf") {
      if (!pdfFile) {
        setError("Upload a PDF first.");
        return;
      }
      const dataUrl = await fileToDataUrl(pdfFile);
      onSubmit({
        kind: "pdf",
        appName: appName || "Uploaded PDF",
        fileDataUrl: dataUrl,
        fileName: pdfFile.name,
      });
    } else if (tab === "image") {
      if (imgFiles.length === 0) {
        setError("Upload at least one screenshot first.");
        return;
      }
      // For the first iteration, we send only the first image -- the pipeline
      // could be extended to handle multiple, but one good screenshot already
      // demonstrates the OCR path.
      const dataUrl = await fileToDataUrl(imgFiles[0]);
      onSubmit({
        kind: "image",
        appName: appName || "Uploaded image",
        fileDataUrl: dataUrl,
        fileName: imgFiles[0].name,
      });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pt-12 pb-20">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to landing
      </button>

      <h1 className="mt-6 text-4xl font-bold tracking-tight">
        Choose your review source
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Three equally-weighted import paths. All four resolve to the same
        internal schema -- reviews are PII-scrubbed at ingestion, before any
        downstream stage touches them.
      </p>

      {/* Tab switch */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <TabCard
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Search className="h-4 w-4" />}
          title="Play Store search"
          subtitle="By app name"
          guidance="Searches the public Play Store listing. Best for live, recent reviews."
        />
        <TabCard
          active={tab === "pdf"}
          onClick={() => setTab("pdf")}
          icon={<FileText className="h-4 w-4" />}
          title="Upload PDF"
          subtitle="Pasted export dumps"
          guidance="PDF of reviews pasted from any source. Multiple reviews per file are auto-split."
        />
        <TabCard
          active={tab === "image"}
          onClick={() => setTab("image")}
          icon={<ImageIcon className="h-4 w-4" />}
          title="Upload image"
          subtitle="Screenshots OK"
          guidance="One or more screenshots of review listings. A vision model reads the rating, date and body."
        />
      </div>

      {/* Tab body */}
      <div className="mt-6 rounded-2xl border border-border bg-[var(--surface)] p-6">
        {tab === "search" && (
          <div>
            <Label htmlFor="q">App name</Label>
            <div className="relative mt-2">
              <Input
                id="q"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="e.g. PhonePe, Spotify, Zerodha..."
                className="h-11"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-3.5 h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border bg-background">
                {results.map((r) => (
                  <button
                    key={r.appId}
                    onClick={() => setSelectedApp(r)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0",
                      selectedApp?.appId === r.appId
                        ? "bg-[var(--primary)]/10"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {r.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.appId}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      {r.score != null && (
                        <span className="text-xs font-semibold text-foreground">
                          {r.score.toFixed(1)} stars
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {r.developer}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!searching && !error && searchQ.trim().length >= 2 && results.length === 0 && (
              <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                No results found. Try a more specific app name.
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {error}
              </div>
            )}
            {selectedApp && (
              <div className="mt-3 rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2 text-sm">
                Selected: <strong>{selectedApp.title}</strong> ({selectedApp.appId})
              </div>
            )}
          </div>
        )}

        {tab === "pdf" && (
          <div>
            <Label htmlFor="appNamePdf">App name (optional, helps classification)</Label>
            <Input
              id="appNamePdf"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. Groww, PhonePe..."
              className="mt-2 h-11"
            />
            <Label className="mt-4 block">PDF file</Label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-4 file:py-2.5 file:font-medium file:text-[var(--primary-foreground)] hover:file:bg-[var(--primary)]/90"
            />
            {pdfFile && (
              <div className="mt-2 text-xs text-muted-foreground">
                {pdfFile.name} | {(pdfFile.size / 1024).toFixed(1)} KB
              </div>
            )}
          </div>
        )}

        {tab === "image" && (
          <div>
            <Label htmlFor="appNameImg">App name (optional, helps classification)</Label>
            <Input
              id="appNameImg"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. Groww, PhonePe..."
              className="mt-2 h-11"
            />
            <Label className="mt-4 block">Image file(s) -- screenshots of review listings</Label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImgFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-4 file:py-2.5 file:font-medium file:text-[var(--primary-foreground)] hover:file:bg-[var(--primary)]/90"
            />
            {imgFiles.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {imgFiles.length} file(s): {imgFiles.map((f) => f.name).join(", ")}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground/80">
              A vision model reads the rating, date and review text directly
              from the image. No standalone OCR library needed.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">
          {tab === "search"
            ? "Public Play Store listing"
            : tab === "pdf"
            ? "Server-side pdf-parse"
            : "Vision model extraction"}
        </div>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={busy}
          className="h-12 px-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running pipeline...
            </>
          ) : (
            "Run pipeline"
          )}
        </Button>
      </div>
    </div>
  );
}

function TabCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  guidance,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  guidance: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm"
          : "border-border bg-background hover:border-[var(--primary)]/40 hover:bg-muted/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            active
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </span>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {title}
          </div>
          <div className="text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {guidance}
      </p>
    </button>
  );
}
