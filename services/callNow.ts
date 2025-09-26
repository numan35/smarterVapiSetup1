// services/callNow.ts — with extra console logs
import Constants from "expo-constants";

type CallNowArgs = {
  targetPhone: string;
  targetName?: string;
  notes?: string;
  scheduledForIso?: string;
};

type CallNowResult =
  | { ok: true; callId: string; vapiId?: string | null }
  | { ok: false; error: string };

const extra: any = Constants.expoConfig?.extra ?? {};
const FUNCTIONS_BASE: string = extra.supabaseFunctionsBase;
const ANON: string = extra.supabaseAnonKey;
const DEV_TOKEN: string | undefined = extra.devToken;

function headersJson() {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ANON}`,
    apikey: ANON,
  };
  if (DEV_TOKEN) h["x-dev-token"] = DEV_TOKEN;
  return h;
}

export async function callNow(args: CallNowArgs): Promise<CallNowResult> {
  if (!FUNCTIONS_BASE || !ANON) {
    return { ok: false, error: "Missing supabaseFunctionsBase or supabaseAnonKey in app config" };
  }
  const url = `${FUNCTIONS_BASE}/call-now`;
  console.log("callNow() POST", { url, headers: headersJson(), body: args });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headersJson(),
      body: JSON.stringify({
        targetPhone: args.targetPhone,
        targetName: args.targetName,
        notes: args.notes,
        scheduledForIso: args.scheduledForIso,
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch {
      console.warn("callNow() bad JSON", { status: res.status, text });
      return { ok: false, error: `Bad JSON from call-now (${res.status})` };
    }
    console.log("callNow() response", { status: res.status, json });
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error || `call-now ${res.status}` };
    }
    return { ok: true, callId: json.callId, vapiId: json.vapiId ?? null };
  } catch (e: any) {
    console.warn("callNow() error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}
