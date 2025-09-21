// lib/jasonBrain.ts
import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseFunctionsBase?: string;
};

const extra: Extra =
  // SDK 49+ (web & native)
  // @ts-expect-error - expoConfig may be undefined in some envs
  (Constants?.expoConfig?.extra as Extra) ??
  // Fallback for older runtimes
  // @ts-expect-error - manifest may be undefined
  (Constants?.manifest?.extra as Extra) ??
  {};

const URL_FROM_ENV = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_FROM_ENV = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_URL = URL_FROM_ENV ?? extra.supabaseUrl ?? "";
const SUPABASE_ANON = ANON_FROM_ENV ?? extra.supabaseAnonKey ?? "";
// Prefer explicit functions base if provided in app.json, otherwise derive from URL
const FUNCTIONS_BASE =
  extra.supabaseFunctionsBase ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "");

// Helpful guardrails:
function assertConfig() {
  if (!SUPABASE_ANON) throw new Error("Missing Supabase anon key. Set EXPO_PUBLIC_SUPABASE_ANON_KEY or extra.supabaseAnonKey in app.json.");
  if (!FUNCTIONS_BASE) throw new Error("Missing functions base. Set extra.supabaseFunctionsBase or EXPO_PUBLIC_SUPABASE_URL.");
}

export async function callJasonBrain(
  conversation: any[],
  state: any = {},
  model: "gpt-4o" | "gpt-4o-mini" = "gpt-4o-mini",
  stream = false
) {
  assertConfig();

  const url = `${FUNCTIONS_BASE}/jason-brain`;
  console.log("[jasonBrain] URL:", url);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON}`,
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify({ conversation, state, model, stream }),
    });
  } catch (e: any) {
    console.error("[jasonBrain] fetch error:", e?.message || e);
    throw new Error(`Network request failed: ${e?.message || String(e)}`);
  }

  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON */
  }

  if (!resp.ok || !data?.ok) {
    console.error("[jasonBrain] HTTP", resp.status, "Body:", data);
    throw new Error(`jason-brain ${resp.status}: ${JSON.stringify(data ?? {})}`);
  }

  return data; // OpenAI-style message (may include tool_calls)
}
