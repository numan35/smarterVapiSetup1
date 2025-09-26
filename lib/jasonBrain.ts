// lib/jasonBrain.ts — client wrapper for the jason-brain function
import Constants from "expo-constants";

type ChatMessage = { role: "user" | "assistant" | "system" | "tool"; content: string; name?: string };
type JasonResponse = {
  ok: boolean;
  build?: string;
  requestId?: string;
  message?: { role: string; content?: string; annotations?: any[] } | null;
  messagesDelta?: any[];
  annotations?: any[];
  slots?: Record<string, any>;
  next_action?: string | null;
  toolRequests?: any[];
  error?: string;
};

const extra: any = Constants.expoConfig?.extra ?? {};
const FUNCTIONS_BASE: string = extra.supabaseFunctionsBase || extra.functionsBase || "";
const ANON: string = extra.supabaseAnonKey || extra.supabaseAnon || "";

function headersJson() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ANON}`,
    apikey: ANON,
  };
}

export async function callJasonBrain(
  messages: ChatMessage[],
  slots: Record<string, any> = {},
  opts: { requestId?: string; dryRun?: boolean } = {}
): Promise<JasonResponse> {
  if (!FUNCTIONS_BASE || !ANON) {
    return { ok: false, error: "Jason config missing: supabaseFunctionsBase and/or supabaseAnonKey" } as any;
  }
  const url = `${FUNCTIONS_BASE}/jason-brain`;
  // SAFE_FETCH_PATCH
  let res: Response;
  try {
    res = await fetch(url, {
    method: "POST",
    headers: {
      ...headersJson(),
      ...(opts.dryRun ? { "x-dry-run": "1" } : null),
    },
    body: JSON.stringify({
      requestId: opts.requestId,
      messages,
      slots,
    }),
  });
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) } as any;
  }
  const text = await res.text();
  let json: JasonResponse;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `Bad JSON from jason-brain (${res.status})` };
  }

  // Back-compat: mirror top-level annotations into message.annotations if missing
  if (json?.message && !json.message.annotations && json.annotations) {
    json.message.annotations = json.annotations;
  }
  return json;
}
