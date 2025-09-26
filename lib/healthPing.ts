// lib/healthPing.ts — ping helper to quickly test functions availability
import Constants from "expo-constants";
const extra: any = Constants.expoConfig?.extra ?? {};

const FUNCTIONS_BASE: string = extra.supabaseFunctionsBase;
const ANON: string = extra.supabaseAnonKey;

function headersJson() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ANON}`,
    apikey: ANON,
  };
}

export async function pingFunction(path: string): Promise<{ ok: boolean; status: number; json?: any; text?: string; }> {
  const url = `${FUNCTIONS_BASE}/${path.replace(/^\//, "")}`;
  console.log("pingFunction URL:", url);
  const res = await fetch(url, { headers: headersJson() });
  const ct = res.headers.get("content-type") || "";
  let payload: any = undefined;
  if (ct.includes("application/json")) {
    try { payload = await res.json(); } catch { /* noop */ }
  } else {
    try { payload = await res.text(); } catch { /* noop */ }
  }
  return { ok: res.ok, status: res.status, json: typeof payload === "object" ? payload : undefined, text: typeof payload === "string" ? payload : undefined };
}
