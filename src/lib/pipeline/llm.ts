// Shared ZAI (GLM) client singleton — server-only.
// The z-ai-web-dev-sdk auto-loads credentials from /etc/.z-ai-config (or
// project-local .z-ai-config) via ZAI.create(). In production deployments the
// user must supply GLM_API_KEY (and optionally GLM_BASE_URL) as Vercel env
// vars — see README. We honor those if set by writing a project-local config
// file at module load time so the SDK's auto-loader picks them up.
//
// hasLLMKey() returns true if EITHER the GLM_API_KEY env var is set OR the
// SDK's auto-loader config file exists at /etc/.z-ai-config or
// <cwd>/.z-ai-config. This way, environments where the SDK has credentials
// (like this sandbox) are treated as "LLM available" even without env vars.

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs/promises";
import path from "path";

const apiKey = process.env.GLM_API_KEY ?? "";
const baseUrl = process.env.GLM_BASE_URL ?? "https://api.z.ai/api/paas/v4";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** True if either GLM_API_KEY env var is set, or the SDK auto-loader config
 * exists at one of its search paths. */
export async function hasLLMKey(): Promise<boolean> {
  if (apiKey) return true;
  // SDK searches in this order: process.cwd()/.z-ai-config, ~home/.z-ai-config, /etc/.z-ai-config
  const localPath = path.join(process.cwd(), ".z-ai-config");
  if (await fileExists(localPath)) return true;
  const homePath = path.join(process.env.HOME ?? "/root", ".z-ai-config");
  if (await fileExists(homePath)) return true;
  if (await fileExists("/etc/.z-ai-config")) return true;
  return false;
}

/** Synchronous version — only checks env var. Use the async version when
 * possible, but this works for places where you can't await (e.g. the
 * top-level module body). Returns false in sandboxed envs that rely on
 * /etc/.z-ai-config. */
export function hasLLMKeySync(): boolean {
  return Boolean(apiKey);
}

// If GLM_API_KEY is set via env (Vercel), write a project-local .z-ai-config
// so the SDK's auto-loader picks it up. Idempotent — only writes if env is set
// and the file does not already exist with matching contents.
async function ensureLocalConfig() {
  if (!apiKey) return; // fall back to /etc/.z-ai-config
  const configPath = path.join(process.cwd(), ".z-ai-config");
  const desired = JSON.stringify({ apiKey, baseUrl });
  try {
    const existing = await fs.readFile(configPath, "utf-8");
    if (existing.trim() === desired.trim()) return;
  } catch {
    // file doesn't exist — fall through and create it
  }
  try {
    await fs.writeFile(configPath, desired, { mode: 0o600 });
  } catch {
    // best-effort; if write fails the SDK will throw a clearer error
  }
}

let clientPromise: Promise<ZAI> | null = null;

export async function getLLM(): Promise<ZAI> {
  if (!clientPromise) {
    clientPromise = (async () => {
      await ensureLocalConfig();
      return ZAI.create();
    })();
  }
  return clientPromise;
}

export { baseUrl };
