// Shared ZAI (GLM) client singleton -- server-only.
// The z-ai-web-dev-sdk auto-loads credentials from /etc/.z-ai-config (or
// project-local .z-ai-config) via ZAI.create(). In production deployments
// (Vercel) the user must supply credentials as env vars; we honor those by
// writing a project-local .z-ai-config file at module load time so the SDK's
// auto-loader picks them up.
//
// The SDK uses FOUR fields for auth (sent as headers):
//   - apiKey   ->  Authorization: Bearer <apiKey>
//   - chatId   ->  X-Chat-Id: <chatId>
//   - userId   ->  X-User-Id: <userId>
//   - token    ->  X-Token: <token>
// We pass through all four from env vars so credentials that work in one
// environment (e.g. this sandbox) can be reproduced in another (Vercel).
//
// hasLLMKey() returns true if EITHER the GLM_API_KEY env var is set OR the
// SDK's auto-loader config file exists at /etc/.z-ai-config or
// <cwd>/.z-ai-config.
//
// withRetry() wraps any async function with exponential backoff for 429s.

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs/promises";
import path from "path";

const apiKey = process.env.GLM_API_KEY ?? "";
const baseUrl = process.env.GLM_BASE_URL ?? "https://api.z.ai/api/paas/v4";
const chatId = process.env.GLM_CHAT_ID ?? "";
const userId = process.env.GLM_USER_ID ?? "";
const token = process.env.GLM_TOKEN ?? "";

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
  const localPath = path.join(process.cwd(), ".z-ai-config");
  if (await fileExists(localPath)) return true;
  const homePath = path.join(process.env.HOME ?? "/root", ".z-ai-config");
  if (await fileExists(homePath)) return true;
  if (await fileExists("/etc/.z-ai-config")) return true;
  return false;
}

/** Synchronous version -- only checks env var. Use the async version when
 * possible. */
export function hasLLMKeySync(): boolean {
  return Boolean(apiKey);
}

// If GLM_API_KEY is set via env (Vercel), write a project-local .z-ai-config
// with ALL the auth fields the SDK supports (apiKey, baseUrl, chatId, userId,
// token) so the SDK's auto-loader picks them up. Idempotent.
async function ensureLocalConfig() {
  if (!apiKey) return; // fall back to /etc/.z-ai-config
  const configPath = path.join(process.cwd(), ".z-ai-config");
  const config: Record<string, string> = { apiKey, baseUrl };
  if (chatId) config.chatId = chatId;
  if (userId) config.userId = userId;
  if (token) config.token = token;
  const desired = JSON.stringify(config);
  try {
    const existing = await fs.readFile(configPath, "utf-8");
    if (existing.trim() === desired.trim()) return;
  } catch {
    // file doesn't exist -- fall through and create it
  }
  try {
    await fs.writeFile(configPath, desired, { mode: 0o600 });
  } catch {
    // best-effort
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

/**
 * Wrap an async function with retry-on-429. GLM's API rate-limits aggressive
 * callers; we back off exponentially (1s, 2s, 4s, 8s) up to 4 attempts.
 * Also catches transient network errors.
 *
 * Usage:
 *   const resp = await withRetry(() => zai.chat.completions.create({...}));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const is429 = msg.includes("429") || /too many requests/i.test(msg);
      const isTransient = is429 || msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT");
      if (!isTransient || attempt === maxAttempts - 1) {
        throw err;
      }
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export { baseUrl };
