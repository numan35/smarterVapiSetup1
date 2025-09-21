// lib/jasonBrain.ts
import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseFunctionsBase?: string; // e.g. https://<ref>.functions.supabase.co  (preferred)
};

const extra: Extra =
  // SDK 49+
  // @ts-expect-error expoConfig may be undefined in some envs
  (Constants?.expoConfig?.extra as Extra) ??
  // Older runtimes
  // @ts-expect-error manifest may be undefined
  (Constants?.manifest?.extra as Extra) ??
  {};

const URL_FROM_ENV  = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_FROM_ENV = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_URL  = URL_FROM_ENV  ?? extra.supabaseUrl  ?? "";
const SUPABASE_ANON = ANON_FROM_ENV ?? extra.supabaseAnonKey ?? "";

/**
 * Resolve the functions base.
 * Prefer an explicit functions base if provided (recommended for web),
 * otherwise fall back to `${supabaseUrl}/functions/v1`.
 */
const FUNCTIONS_BASE =
  extra.supabaseFunctionsBase && extra.supabaseFunctionsBase.trim().length > 0
    ? extra.supabaseFunctionsBase.replace(/\/+$/, "") // strip trailing slash
    : (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1` : "");

// Helpful guardrails
function assertConfig() {
  if (!SUPABASE_ANON) {
    throw new Error(
      "Missing Supabase anon key. Set EXPO_PUBLIC_SUPABASE_ANON_KEY or extra.supabaseAnonKey in app.json."
    );
  }
  if (!FUNCTIONS_BASE) {
    throw new Error(
      "Missing functions base. Set extra.supabaseFunctionsBase (recommended) or EXPO_PUBLIC_SUPABASE_URL."
    );
  }
}

// Types for the response we expect from /jason-brain
export type JasonToolRequest = { name: string; args: Record<string, any> };
export type JasonAnnotation = { type: "slot_set"; key: string; value: any };

export type JasonBrainResponse = {
  ok: true;
  message: { role: "assistant"; content: string; refusal?: any; annotations?: JasonAnnotation[]; tool_calls?: any[] };
  annotations?: JasonAnnotation[];
  toolRequests?: JasonToolRequest[];
} | {
  ok: false;
  error: string;
  [k: string]: any;
};

export async function callJasonBrain(
  conversation: any[],
  state: any = {},
  model: "gpt-4o" | "gpt-4o-mini" = "gpt-4o-mini",
  stream = false
): Promise<JasonBrainResponse> {
  assertConfig();

  const url = `${FUNCTIONS_BASE}/jason-brain`;
  console.log("[jasonBrain] URL:", url);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON}`, // required on Supabase Functions
        apikey: SUPABASE_ANON,                    // belt & suspenders (browser CORS)
      },
      body: JSON.stringify({ conversation, state, model, stream }),
    });
  } catch (e: any) {
    console.error("[jasonBrain] fetch error:", e?.message || e);
    throw new Error(`Network request failed: ${e?.message || String(e)}`);
  }

  // Try to parse JSON; if not JSON, keep raw text for debugging
  const text = await resp.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!resp.ok || !data?.ok) {
    console.error("[jasonBrain] HTTP", resp.status, "Body:", data);
    throw new Error(`jason-brain ${resp.status}: ${JSON.stringify(data ?? {})}`);
  }

  // ✅ Return the full payload so the UI can read .annotations and .toolRequests
  return data as JasonBrainResponse;
}

export default callJasonBrain;
