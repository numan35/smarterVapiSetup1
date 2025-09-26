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

// lib/healthPing.ts
export async function pingFunction(path: string) {
  const url = `${FUNCTIONS_BASE}/${path.replace(/^\//, "")}`;
  console.log("pingFunction URL:", url);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "GET",               // be explicit
      headers: headersJson(),      // must include Authorization + apikey
      signal: ac.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }

    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? await res.json() : await res.text();
  } catch (err: any) {
    // Surface CORS/network vs abort distinctly
    if (err.name === "AbortError") {
      throw new Error("Ping timed out after 8s");
    }
    // TypeError often = CORS or network
    throw new Error(`Ping failed: ${err?.message || String(err)}`);
  } finally {
    clearTimeout(t);
  }
}
