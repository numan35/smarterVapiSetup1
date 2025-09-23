// lib/jasonBrain.ts
import Constants from "expo-constants";

type Msg = { role: "user" | "assistant" | "tool"; content: string; name?: string; tool_call_id?: string };
type Slots = Record<string, any>;

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseFunctionsBase?: string;
  supabaseAnonKey?: string;
};

const FUNCTIONS_BASE =
  extra.supabaseFunctionsBase ||
  // fallback if you only provided supabaseUrl
  (extra as any).supabaseUrl?.replace(".supabase.co", ".functions.supabase.co");

const ANON = extra.supabaseAnonKey;

if (!FUNCTIONS_BASE) {
  console.warn("[jasonBrain] Missing functions base URL in expo.extra.supabaseFunctionsBase");
}
if (!ANON) {
  console.warn("[jasonBrain] Missing anon key in expo.extra.supabaseAnonKey");
}

export default async function callJasonBrain(
  messages: Msg[],
  slots?: Slots,
  opts?: { dryRun?: boolean }
): Promise<any> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("callJasonBrain: messages[] is required and must be non-empty");
  }
  const url = `${FUNCTIONS_BASE}/jason-brain`;

 const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(ANON ? { "Authorization": `Bearer ${ANON}`, "apikey": ANON } : {}),
};


  // optional model-free sanity
  if (opts?.dryRun) headers["x-dry-run"] = "1";

  const body = {
    messages,               // ✅ always messages[]
    slots: slots ?? {},      // ✅ always an object
  };

  // tiny debug preview
  try {
    const preview = JSON.stringify({ url, hasAnon: !!ANON, msgCount: messages.length, slotKeys: Object.keys(slots ?? {}) });
    console.log("[jasonBrain] ->", preview);
  } catch {}

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch (e) {
    throw new Error(`jason-brain parse error (${res.status}): ${String(e)}`);
  }

  if (!res.ok) {
    // surface the server’s message
    const msg = payload?.error || payload?.message || `HTTP ${res.status}`;
    const detail = JSON.stringify(payload);
    throw new Error(`jason-brain error: ${msg} :: ${detail}`);
  }

  return payload?.message ?? payload; // your server usually returns { ok, message, ... }
}
