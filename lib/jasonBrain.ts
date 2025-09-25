// app/lib/jasonBrain.ts
// Client wrapper for the Jason Brain edge function (vNext contract).
// Sends { threadId, requestId, messages, slots } and returns the server JSON as-is.
// Reads Supabase anon key and functions base from Expo Constants if available.

import Constants from "expo-constants";

type Role = "system" | "user" | "assistant" | "tool";
export type Msg = { role: Role; content: string };

export type JasonPayload = {
  threadId: string;
  requestId: string;
  messages: Msg[];
  slots?: Record<string, any>;
};

export type JasonResponse = {
  ok: boolean;
  build?: string;
  requestId?: string;
  messagesDelta?: Msg[];
  annotations?: any[];
  slots?: Record<string, any>;
  next_action?: any;
  toolRequests?: any[];
  error?: string;
};

function getConfig() {
  const extra = (Constants?.expoConfig as any)?.extra || (Constants?.manifest as any)?.extra || {};
  const functionsBase: string =
    extra.functionsBase ||
    // Fallback to your known project ref (update if needed):
    "https://lkoogdveljyxwweranaf.functions.supabase.co";
  const anon: string =
    extra.supabaseAnon ||
    // Fallback to your anon (from earlier setup):
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb29nZHZlbGp5eHd3ZXJhbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NjQ1MDEsImV4cCI6MjA3MjU0MDUwMX0.gER6-spRheuIzCe_ET-ntaklbRQHkmGb75I3UJkFYKs";
  return { functionsBase, anon };
}

export default async function callJasonBrain(payload: JasonPayload, opts?: { dryRun?: boolean }): Promise<JasonResponse> {
  const { functionsBase, anon } = getConfig();
  const url = `${functionsBase}/jason-brain`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anon}`,
      "apikey": anon,
      ...(opts?.dryRun ? { "x-dry-run": "1" } : {}),
    },
    body: JSON.stringify(payload),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(`jason-brain error: ${msg}`);
  }

  return data as JasonResponse;
}
