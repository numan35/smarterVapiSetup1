// services/callNow.ts
import Constants from "expo-constants";

// ---- Request body (kept in sync with Edge Function) ----
export type CallNowBody = {
  // REQUIRED
  targetPhone: string; // E.164 (+14045551234)

  // Recommended / used by the function
  businessName?: string | null;   // shown as caller name to Vapi
  customerName?: string | null;   // used in firstMessage template

  // Reservation slots
  partySize?: number | null;
  date?: string | null;                  // "YYYY-MM-DD" (or ISO; server normalizes)
  desiredWindowStart?: string | null;    // FULL ISO preferred: "YYYY-MM-DDTHH:mm:ss"
  desiredWindowEnd?: string | null;      // FULL ISO preferred

  // Optional
  notes?: string | null;
  source?: "app" | "admin" | string;
  requestId?: string | null;
  targetId?: string | null;
  script?: string | null;                // optional custom opener
};

// ---- Response shape ----
export type CallNowResponse =
  | { ok: true; callId: string | null; vapiId?: string | null }
  | { ok: false; error: string; status?: number; details?: any };

// Small helper: coerce to E.164 if possible (belt & suspenders; UI should already normalize)
function toE164Maybe(s: string): string {
  const raw = (s || "").trim();
  if (/^\+\d{10,15}$/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (!d) return raw;
  if (d.length === 10) return `+1${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

export async function callNow(args: CallNowBody): Promise<CallNowResponse> {
  const extra = (Constants.expoConfig?.extra ?? {}) as any;

  const base =
    extra.supabaseFunctionsBase ??
    `https://${String(extra?.supabaseUrl || "")
      .replace(/^https?:\/\//, "")
      .split(".supabase.co")[0]}.functions.supabase.co`;

  const url = `${base}/call-now`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Supabase platform requires an Authorization header (anon is fine for dev)
  if (extra?.supabaseAnonKey) {
    headers["Authorization"] = `Bearer ${extra.supabaseAnonKey}`;
    headers["apikey"] = extra.supabaseAnonKey;
  }
  // Dev short-circuit (must match CALL_NOW_TEST_TOKEN on the server)
  if (extra?.devToken) {
    headers["x-dev-token"] = String(extra.devToken);
  }

  // Build payload the function expects
  const body = {
    // required
    targetPhone: toE164Maybe(args.targetPhone),

    // recommended
    businessName: args.businessName ?? null,
    customerName: args.customerName ?? null,

    // slots
    partySize: args.partySize ?? null,
    date: args.date ?? null,
    desiredWindowStart: args.desiredWindowStart ?? null,
    desiredWindowEnd: args.desiredWindowEnd ?? null,

    // optional
    notes: args.notes ?? null,
    source: args.source ?? "app",
    requestId: args.requestId ?? null,
    targetId: args.targetId ?? null,
    script: args.script ?? null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      // leave as object with raw text if not JSON
      json = { raw: text };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error ?? res.statusText ?? `HTTP ${res.status}`,
        status: res.status,
        details: json?.details ?? json?.raw,
      };
    }

    return {
      ok: true,
      callId: json?.callId ?? json?.call?.id ?? null,
      vapiId: json?.vapiId ?? null,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? "Network error",
    };
  }
}
