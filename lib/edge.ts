// lib/edge.ts — helpers for edge functions; no hardcoded domains
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

export async function makeIcs(payload: any): Promise<string> {
  const res = await fetch(`${FUNCTIONS_BASE}/make-ics`, {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`make-ics failed: ${res.status}`);
  return await res.text();
}
