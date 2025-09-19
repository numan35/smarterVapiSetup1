// services/callNow.ts
import Constants from "expo-constants";

const { functionsBase, supabaseAnonKey } = (Constants.expoConfig?.extra ?? {}) as {
  functionsBase?: string;
  supabaseAnonKey?: string;
};

export type CallNowInput = {
  targetPhone: string;
  businessName: string;
  customerName: string;
  partySize: number;
  date: string;                // ISO yyyy-mm-dd
  desiredWindowStart: string;  // "19:00"
  desiredWindowEnd: string;    // "19:30"
  notes?: string | null;
  source?: string;             // "app" | "jason" etc.
};

export async function callNow(payload: CallNowInput) {
  if (!functionsBase || !supabaseAnonKey) {
    console.error("Missing functionsBase or supabaseAnonKey in config");
    return { ok: false, error: "Missing config" };
  }

  try {
    const res = await fetch(`${functionsBase}/call-now`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("callNow error:", text);
      return { ok: false, error: text };
    }

    return await res.json();
  } catch (err: any) {
    console.error("callNow exception:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}
