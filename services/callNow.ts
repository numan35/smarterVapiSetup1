

console.log('[callNow] loaded from services/callNow.ts');


// services/callNow.ts
import Constants from "expo-constants";

export type CallNowBody = {
  // REQUIRED
  targetPhone: string; // E.164 (+14045551234)

  // Server-expected fields
  targetName?: string | null;
  time?: string | null;        // "HH:mm" or ISO time
  phoneE164?: string | null;

  // Your existing fields (kept for convenience)
  businessName?: string | null;
  customerName?: string | null;

  partySize?: number | null;
  date?: string | null;               // "YYYY-MM-DD" (or ISO)
  desiredWindowStart?: string | null; // optional window (ISO)
  desiredWindowEnd?: string | null;

  notes?: string | null;
  source?: "app" | "admin" | string;
  requestId?: string | null;
  targetId?: string | null;
  script?: string | null;
};

type CallNowResponse =
  | { ok: true; callId: string | null; vapiId?: string | null }
  | { ok: false; error: string; status?: number; details?: any };

// Normalize to E.164 (US default if 10 digits)
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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (extra?.supabaseAnonKey) {
    headers.Authorization = `Bearer ${extra.supabaseAnonKey}`;
    headers.apikey = extra.supabaseAnonKey;
  }
  if (extra?.devToken) headers["x-dev-token"] = String(extra.devToken);

  // ---- Map BOTH old and new shapes to what the server expects ----
  const targetName =
    args.targetName ?? args.businessName ?? null;

  const time =
    args.time ?? args.desiredWindowStart ?? null;

  const phoneE164 =
    args.phoneE164 ?? null;

  const body = {
    // required
    targetPhone: toE164Maybe(args.targetPhone),

    // expected by server
    targetName,
    time,
    phoneE164,

    // useful context (server may ignore unknowns)
    partySize: args.partySize ?? null,
    date: args.date ?? null,
    desiredWindowStart: args.desiredWindowStart ?? null,
    desiredWindowEnd: args.desiredWindowEnd ?? null,
    notes: args.notes ?? null,
    source: args.source ?? "app",
    requestId: args.requestId ?? null,
    targetId: args.targetId ?? null,
    script: args.script ?? null,

    // optional niceties
    businessName: args.businessName ?? null,
    customerName: args.customerName ?? null,
  };
  
console.log("[callNow] POST", url);

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) {
      return { ok: false, error: json?.error ?? res.statusText ?? `HTTP ${res.status}`, status: res.status, details: json?.details ?? json?.raw };
    }

    return { ok: true, callId: json?.callId ?? json?.call?.id ?? null, vapiId: json?.vapiId ?? null };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

export default callNow;
