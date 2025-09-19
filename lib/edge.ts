// lib/edge.ts
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";

/**
 * Reads your Supabase anon key from app.json -> extra.supabaseAnonKey
 * Falls back to EXPO_PUBLIC_SUPABASE_ANON_KEY if needed.
 */
const ANON =
  (Constants.expoConfig?.extra as any)?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/** Your fixed Functions base (project: lkoogdveljyxwweranaf) */
const FUNCTIONS_BASE = "https://lkoogdveljyxwweranaf.functions.supabase.co";

/** Optional: nicer error logs for FunctionsHttpError */
async function handleFnError(e: any, tag = "fn") {
  if (e?.name === "FunctionsHttpError" && e?.context) {
    try {
      const text = await e.context.text?.();
      console.log(`${tag} status=`, e.context.status, "body=", text);
    } catch {}
  }
  throw e;
}

/** Common headers for direct fetch to Edge Functions */
const fnHeaders = () => ({
  Authorization: `Bearer ${ANON}`,
  apikey: ANON,
  "Content-Type": "application/json",
});

/* =========================
   Types
   ========================= */

export type CallRecord = {
  id: string;
  vapi_call_id: string | null;
  status: string;
  proposal?: any;
};

export type CallNowParams = {
  /** required: E.164 number from Places */
  targetPhone: string;
  /** optional notes displayed/stored in calls.result */
  notes?: string;
  /** optional override; otherwise server default assistant is used */
  agentId?: string;

  /* --- Objective context (per-call) --- */
  vertical?: "appliance";
  businessName?: string;
  businessAddress?: string;
  businessRating?: number;
  desiredWindowStart?: string; // ISO
  desiredWindowEnd?: string;   // ISO
  customerName?: string;
  customerCallback?: string;
  policy?: { no_credit_cards?: boolean; no_confirmation?: boolean };
  mustReturn?: string;
};

export type FindBusinessParams = {
  q: string;
  vertical?: "appliance";
  city?: string;
  near?: { lat: number; lng: number };
  limit?: number;
};

export type CallSlotInput = {
  vertical: "appliance";
  service_type?: "repair" | "install" | string;
  window_start?: string | null; // ISO
  window_end?: string | null;   // ISO
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  extracted?: any | null;
};

/* =========================
   Functions
   ========================= */

/**
 * Places-backed business finder (GET).
 * Returns { source: "live"|"cache", items: [...] }
 */
export async function findBusiness(params: FindBusinessParams) {
  const { q, vertical = "appliance", city, near, limit = 5 } = params;
  const nearStr = near ? `${near.lat}%2C${near.lng}` : "";
  const url =
    `${FUNCTIONS_BASE}/find-business` +
    `?q=${encodeURIComponent(q)}` +
    `&vertical=${vertical}` +
    (city ? `&city=${encodeURIComponent(city)}` : "") +
    (near ? `&near=${nearStr}` : "") +
    `&limit=${limit}`;

  const r = await fetch(url, { headers: fnHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`find-business ${r.status}: ${t}`);
  }
  return r.json();
}

/**
 * Start an outbound call via the Edge Function.
 * MVP: includes x-dev-token and gateway headers (remove x-dev-token when you enforce auth).
 */
export async function callNow(params: CallNowParams): Promise<CallRecord> {
  try {
    const { data, error } = await supabase.functions.invoke("call-now", {
      body: {
        targetPhone: params.targetPhone,
        notes: params.notes,
        agentId: params.agentId,

        // 👇 objective context (server will put into metadata.objective for Vapi)
        vertical: params.vertical ?? "appliance",
        businessName: params.businessName,
        businessAddress: params.businessAddress,
        businessRating: params.businessRating,
        desiredWindowStart: params.desiredWindowStart,
        desiredWindowEnd: params.desiredWindowEnd,
        customerName: params.customerName ?? "Numan",
        customerCallback: params.customerCallback,
        policy: params.policy ?? { no_credit_cards: true, no_confirmation: true },
        mustReturn:
          params.mustReturn ??
          "single-line JSON with fields: intent='appliance_service', date, timeWindow, priceQuote(optional), status, notes",
      },
      headers: {
        // ✅ MVP dev path so server chooses the dev branch
        "x-dev-token": "dev-token-123",
        // ✅ Functions gateway headers (same as your PowerShell tests)
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
      },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "call-now failed");
    return data.call as CallRecord;
  } catch (e) {
    await handleFnError(e, "call-now");
  }
}

/**
 * Minimal helper to persist an end-of-call summary into calls.result.notes.
 * You can call this after status === 'completed' if you want a single notes field.
 */
export async function saveReportToNotes(callId: string, endReport: any) {
  const summary =
    endReport?.summary ?? endReport?.text ?? JSON.stringify(endReport);
  const { data, error } = await supabase
    .from("calls")
    .update({ result: { notes: summary } })
    .eq("id", callId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * (Optional) Normalize appliance request → slot payload for `call_slots`.
 * Returns a normalized object with fields we can persist.
 */
export async function normalizeAppliance(body: {
  prompt?: string;
  address?: { line1?: string; city?: string; state?: string; postal?: string };
  phone?: string;
}) {
  const r = await fetch(`${FUNCTIONS_BASE}/normalize-appliance`, {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`normalize-appliance ${r.status}: ${t}`);
  }
  return r.json();
}

/**
 * Write a single row into public.call_slots for a given call.
 * Assumes RLS allows the current user to insert for their own call_id.
 */
export async function writeCallSlots(callId: string, slot: CallSlotInput) {
  const payload = {
    call_id: callId,
    vertical: "appliance" as const,
    service_type: slot.service_type ?? "repair",
    window_start: slot.window_start ?? null,
    window_end: slot.window_end ?? null,
    address_line1: slot.address_line1 ?? null,
    city: slot.city ?? null,
    state: slot.state ?? null,
    postal_code: slot.postal_code ?? null,
    contact_name: slot.contact_name ?? null,
    contact_phone: slot.contact_phone ?? null,
    notes: slot.notes ?? null,
    extracted: slot.extracted ?? null,
  };

  const { data, error } = await supabase
    .from("call_slots")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Convenience: normalize -> call-now -> write call_slots.
 * Returns { call, slot }.
 */
export async function startApplianceCall(opts: {
  searchPrompt?: string; // free text like "AC not cooling; afternoon window"
  address?: { line1?: string; city?: string; state?: string; postal?: string };
  customerPhone?: string; // callback phone
  business: { name: string; address?: string; rating?: number; e164_phone: string };
  window?: { startISO?: string; endISO?: string };
  notes?: string;
}) {
  // 1) Normalize the prompt into slot-ish fields (optional)
  const norm = await normalizeAppliance({
    prompt: opts.searchPrompt,
    address: opts.address,
    phone: opts.customerPhone,
  }).catch(() => null);

  // 2) Start the call (objective context included)
  const call = await callNow({
    targetPhone: opts.business.e164_phone,
    notes: opts.notes ?? opts.searchPrompt,
    vertical: "appliance",
    businessName: opts.business.name,
    businessAddress: opts.business.address,
    businessRating: opts.business.rating,
    desiredWindowStart: opts.window?.startISO,
    desiredWindowEnd: opts.window?.endISO,
    customerName: "Numan",
    customerCallback: opts.customerPhone,
    policy: { no_credit_cards: true, no_confirmation: true },
    mustReturn:
      "single-line JSON with fields: intent='appliance_service', date, timeWindow, priceQuote(optional), status, notes",
  });

  // 3) Persist call_slots (ties the request intent to this call)
  const slotRow = await writeCallSlots(call.id, {
    vertical: "appliance",
    service_type: norm?.service_type ?? "repair",
    window_start: opts.window?.startISO ?? norm?.window_start ?? null,
    window_end: opts.window?.endISO ?? norm?.window_end ?? null,
    address_line1: norm?.address_line1 ?? opts.address?.line1 ?? null,
    city: norm?.city ?? opts.address?.city ?? null,
    state: norm?.state ?? opts.address?.state ?? null,
    postal_code: norm?.postal_code ?? opts.address?.postal ?? null,
    contact_name: "Numan",
    contact_phone: norm?.contact_phone ?? opts.customerPhone ?? null,
    notes: norm?.notes ?? opts.notes ?? opts.searchPrompt ?? null,
    extracted: norm?.extracted ?? (opts.searchPrompt ? { prompt: opts.searchPrompt } : null),
  });

  return { call, slot: slotRow };
}

/**
 * Approve/decline a proposal; server may trigger a second "finalize" call.
 */
export async function callFinalize(body: { call_id: string; approve: boolean }) {
  const r = await fetch(`${FUNCTIONS_BASE}/call-finalize`, {
    method: "POST",
    headers: {
      ...fnHeaders(),
      "x-dev-token": "dev-token-123",   // <— add this for MVP dev mode
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`call-finalize ${r.status}: ${t}`);
  }
  return r.json();
}


/**
 * Generate an ICS and return it as text; you can save/share it on device.
 */
export async function makeIcs(body: {
  title: string;
  startISO: string;
  endISO: string;
  location?: string;
  description?: string;
}) {
  const r = await fetch(`${FUNCTIONS_BASE}/make-ics`, {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`make-ics ${r.status}: ${t}`);
  }
  return r.text(); // "text/calendar"
}
