// Shared Supabase client factory for MCP tools. Import-safe: no env reads at module scope.
import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

// The app authenticates against this Supabase project (same values as
// src/integrations/supabase/client.ts). Env vars are only a fallback.
export const SUPABASE_PROJECT_REF = "ckkjqpsoavrikgiuuktf";
const DEFAULT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const DEFAULT_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra2pxcHNvYXZyaWtnaXV1a3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NDY1MDYsImV4cCI6MjEwMjEyMjUwNn0.XJREMPDEOyswhr7bLGE0TwKaRQyCWmcAiyPBitAPOOU";

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  return url && url.includes(SUPABASE_PROJECT_REF) ? url : DEFAULT_URL;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv([
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]);
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (direct && url?.includes(SUPABASE_PROJECT_REF)) return direct;
  return DEFAULT_PUBLISHABLE_KEY;
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function notAuthenticated() {
  return {
    content: [{ type: "text" as const, text: "Non authentifié : reconnectez le connecteur." }],
    isError: true,
  };
}
