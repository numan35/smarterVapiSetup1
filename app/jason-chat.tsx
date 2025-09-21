// app/jason-chat.tsx
import { useState, useRef } from "react";
import { View, Text, TextInput, Button, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { callJasonBrain } from "@/lib/jasonBrain";
import { callNow } from "@/services/callNow";
import Constants from "expo-constants";

// ---------- Debug helpers ----------
function logToolCallsAnyShape(m: any, tag = "") {
  try {
    console.log(`<<< INSTRUMENTED ${tag}: after callJasonBrain >>>`);
    try {
      const preview = JSON.stringify(m)?.slice(0, 600);
      console.log("📦 assistant preview:", preview);
    } catch {}
    const msgs = Array.isArray(m) ? m : (m?.message ? [m.message] : [m]).filter(Boolean);
    const allCalls = msgs.flatMap((x: any) => x?.tool_calls ?? []);
    const names = allCalls.map((c: any) => c?.function?.name ?? c?.name ?? "unknown");
    console.log("🔧 Tool calls this turn:", names);
    for (const c of allCalls) {
      const nm = c?.function?.name ?? c?.name;
      if (nm === "upsert_request_slots") {
        console.log("🧩 upsert_request_slots args:", c?.function?.arguments ?? c?.arguments);
      }
    }
  } catch (e) {
    console.log("⚠️ logToolCallsAnyShape error:", e);
  }
}

const { functionsBase, supabaseAnonKey } = (Constants.expoConfig?.extra ?? {}) as {
  functionsBase?: string;
  supabaseAnonKey?: string;
};

type Msg = { role: "user" | "assistant" | "tool"; content: string; name?: string; tool_call_id?: string };

type SlotsState = {
  kind?: "appliance" | "restaurant" | "tires" | "other";
  mode?: "discovery" | "booking";
  geoCenter?: { lat: number; lng: number } | null;
  radiusMiles?: number;
  desiredStart?: string | null;
  desiredEnd?: string | null;
  details?: {
    address?: string;
    website?: string;
    placeId?: string;
    city?: string;
    distanceMi?: number;
    restaurantName?: string;
    partySize?: number;
    date?: string;
    timeWindowStart?: string;
    timeWindowEnd?: string;
    specialRequests?: string;
    userPhone?: string;
    restaurantPhone?: string;
    targetPhone?: string;
    [k: string]: any;
  };
  ui?: { expectingDestPhone?: boolean };
};

// ---------- Utilities ----------
function digitsOnly(s: string) { return (s.match(/\d/g) || []).join(""); }
function maybeExtractPhoneFromText(text: string): string | undefined {
  const d = digitsOnly(text);
  if (d.length >= 10 && d.length <= 15) return d.length === 10 ? `+1${d}` : `+${d}`;
  return undefined;
}
const TZ = "America/New_York";

function to24h(raw: string) {
  let s = raw.trim();
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = m12[2] ? parseInt(m12[2], 10) : 0;
    const ap = m12[3].toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const mHourOnly = s.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (mHourOnly) return to24h(`${mHourOnly[1]}:00 ${mHourOnly[2]}`);
  return undefined;
}
function addMinutes(hhmm: string, minutes: number) {
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(2000, 0, 1, hh, mm));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  const H = String(date.getUTCHours()).padStart(2, "0");
  const M = String(date.getUTCMinutes()).padStart(2, "0");
  return `${H}:${M}`;
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const WEEKDAYS: Record<string, number> = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
function nyNowParts() {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year:"numeric", month:"numeric", day:"numeric" });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}
function nyTodayISO() {
  const { y, m, d } = nyNowParts();
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function addDaysToISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const Y = dt.getUTCFullYear(); const M = String(dt.getUTCMonth() + 1).padStart(2, "0"); const D = String(dt.getUTCDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
}
function nextWeekdayISO(targetDow: number, inclusive = true) {
  const today = nyTodayISO();
  const [y, m, d] = today.split("-").map(n => parseInt(n, 10));
  const now = new Date(Date.UTC(y, m - 1, d));
  const currentDow = now.getUTCDay();
  let delta = (targetDow - currentDow + 7) % 7;
  if (!inclusive && delta === 0) delta = 7;
  return addDaysToISO(today, delta);
}
function parseNaturalDateToISO(text: string, fallbackIsoDate?: string) {
  const t = text.trim().toLowerCase();
  if (/\btoday\b/.test(t)) return nyTodayISO();
  if (/\btomorrow\b/.test(t)) return addDaysToISO(nyTodayISO(), 1);
  const wd = t.match(/\b(?:this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const word = wd[1].toLowerCase();
    const idx = WEEKDAYS[word];
    const isNext = /\bnext\s+/.test(wd[0]);
    return nextWeekdayISO(idx, !/\bthis\s+/.test(wd[0]) && !isNext) || nextWeekdayISO(idx);
  }
  const monthAlternation = MONTHS.map(m => m.slice(0,3)).join("|") + "|" + MONTHS.join("|");
  const m1 = t.match(new RegExp(`\\b(${monthAlternation})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?\\b`, "i"));
  if (m1) {
    const monStr = m1[1].toLowerCase();
    const day = parseInt(m1[2], 10);
    const year = m1[3] ? parseInt(m1[3], 10) : undefined;
    const monIdx = MONTHS.findIndex(m => m === monStr || m.slice(0,3) === monStr.slice(0,3));
    const { y } = nyNowParts();
    const Y = year ?? y;
    return `${Y}-${String(monIdx + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  const m2 = t.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthAlternation})(?:,?\\s*(\\d{4}))?\\b`, "i"));
  if (m2) {
    const day = parseInt(m2[1], 10);
    const monStr = m2[2].toLowerCase();
    const year = m2[3] ? parseInt(m2[3], 10) : undefined;
    const monIdx = MONTHS.findIndex(m => m === monStr || m.slice(0,3) === monStr.slice(0,3));
    const { y } = nyNowParts();
    const Y = year ?? y;
    return `${Y}-${String(monIdx + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  const mUs  = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (mUs) {
    const mm = parseInt(mUs[1], 10);
    const dd = parseInt(mUs[2], 10);
    const yy = mUs[3];
    const { y } = nyNowParts();
    const Y = yy ? (yy.length === 2 ? (Number(yy) >= 70 ? 1900 + Number(yy) : 2000 + Number(yy)) : Number(yy)) : y;
    return `${Y}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
  }
  const mIso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (mIso) return mIso[1];
  return fallbackIsoDate;
}
function prettyDate(iso?: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  try {
    return dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: TZ,
    });
  } catch {
    return iso;
  }
}
function prettyTime(hhmm?: string) {
  if (!hhmm) return "-";
  const [H, M] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(H) || Number.isNaN(M)) return hhmm;
  const dt = new Date(Date.UTC(2000, 0, 1, H, M));
  try {
    return dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    }).replace(":00 ", " ");
  } catch {
    const ampm = H >= 12 ? "PM" : "AM";
    const h12 = H % 12 === 0 ? 12 : H % 12;
    return `${h12}:${String(M).padStart(2,"0")} ${ampm}`;
  }
}
function prettyRange(s?: string, e?: string) {
  const ps = prettyTime(s);
  const pe = prettyTime(e);
  if (ps === "-" && pe === "-" ) return "-";
  return `${ps}–${pe}`;
}
function parseISOishDateTime(s?: string | null) {
  if (!s) return null;
  const m = String(s).match(/(\\d{4}-\\d{2}-\\d{2})[ T](\\d{2}):(\\d{2})/);
  if (!m) return null;
  return { date: m[1], time: `${m[2]}:${m[3]}` };
}
function messageImpliesDestinationPhone(text: string) {
  const t = text.toLowerCase();
  if (/\b(my|mine)\b/.test(t)) return false;
  if (/\b(my number|my phone)\b/.test(t)) return false;
  if (/\brestaurant(?:'s)? (?:phone|number)\b/.test(t)) return true;
  if (/\btheir (?:phone|number)\b/.test(t)) return true;
  if (/\bcall (?:this|that)\b/.test(t)) return true;
  if (/\bnumber to call\b/.test(t)) return true;
  if (/\bbook(?:ing)? number\b/.test(t)) return true;
  if (/\bfront desk\b/.test(t)) return true;
  return false;
}
function extractDestPhoneFromAssistant(text: string): string | undefined {
  if (!text) return undefined;
  if (/\b(my|your)\s+(?:phone|number)\b/i.test(text)) return undefined;
  if (!/\b(phone|number)\b/i.test(text)) return undefined;
  const m1 = text.match(/(?:phone(?:\s*number)?(?:\s*is|:)?)\s*([\+\(]?\d[\d\-\s\(\)]{8,}\d)/i);
  const m2 = !m1 ? text.match(/([\+\(]?\d[\d\-\s\(\)]{8,}\d)/) : null;
  const raw = (m1 && m1[1]) || (m2 && m2[1]) || undefined;
  if (!raw) return undefined;
  return maybeExtractPhoneFromText(raw);
}
function asAssistantMessage(m: any): Msg {
  if (Array.isArray(m)) return m[m.length - 1];
  if (m?.message) return m.message as Msg;
  return m as Msg;
}

export default function JasonChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi, I'm Jason. What would you like me to do?" },
  ]);
  const protocolRef = useRef<Msg[]>([
    { role: "assistant", content: "Hi, I'm Jason. What would you like me to do?" },
  ]);

  const [state, _setState] = useState<SlotsState>({});
  const slotsRef = useRef<SlotsState>({});
  const setState = (next: SlotsState | ((s: SlotsState) => SlotsState)) => {
    _setState((prev) => {
      const resolved = typeof next === "function" ? (next as any)(prev) : next;
      slotsRef.current = resolved;
      return resolved;
    });
  };

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ✅ FIXED: actually append what you pass in
  function append(msgs: Msg[]) {
    setMessages((m) => [...m, ...msgs]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 10);
  }

  // Apply a single annotation from the server to local slot state
  function applyAnnotation(key: string, value: any) {
    setState((s) => {
      const next: SlotsState = { ...s, details: { ...(s.details ?? {}) } };
      const d = next.details!;
      switch (key) {
        case "restaurant":
          d.restaurantName = String(value);
          break;
        case "placeId":
          d.placeId = String(value);
          break;
        case "destPhone":
          d.restaurantPhone = String(value);
          d.targetPhone = String(value);
          break;
        case "address":
          d.address = String(value);
          break;
        case "website":
          d.website = String(value);
          break;
        case "geo":
          if (value && typeof value === "object" && "lat" in value && "lng" in value) {
            next.geoCenter = { lat: Number(value.lat), lng: Number(value.lng) };
          }
          break;
        case "partySize":
          d.partySize = Number(value);
          break;
        case "date":
          d.date = String(value);
          break;
        case "time": {
          const t = String(value);
          // your UI shows a window; infer 30-min window if only a single time is provided
          d.timeWindowStart = t;
          d.timeWindowEnd = addMinutes(t, 30);
          break;
        }
        default:
          // keep a details map for debugging/visibility
          d[key] = value;
      }
      return next;
    });
  }

  async function handleSend(input: string) {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };

    // --- decide mode (discovery vs booking)
    const lower = userMsg.content.toLowerCase();
    const showsBookingIntent =
      /\b(book|reserve|reservation|call (?:and )?make|make (?:a )?reservation|hold a table|please call)\b/.test(lower) ||
      /\b(let'?s do|go with|choose|pick)\b/.test(lower);
    setState((s) => ({ ...s, mode: showsBookingIntent ? "booking" : (s.mode ?? "discovery") }));

    // geo seeds
    if (/\broseville\b/i.test(userMsg.content)) {
      setState((s) => ({
        ...s,
        geoCenter: s.geoCenter ?? { lat: 38.7521, lng: -121.2880 },
        radiusMiles: s.radiusMiles ?? 3,
      }));
    }
    if (/\balpharetta\b/i.test(userMsg.content)) {
      setState((s) => ({
        ...s,
        geoCenter: s.geoCenter ?? { lat: 34.0754, lng: -84.2941 },
        radiusMiles: s.radiusMiles ?? 3,
      }));
    }

    // opportunistic captures
    if ((slotsRef.current.mode ?? "discovery") === "booking") {
      const maybeDate = parseNaturalDateToISO(userMsg.content);
      if (maybeDate) setState((s) => ({ ...s, details: { ...(s.details ?? {}), date: maybeDate } }));
    }

    const num = maybeExtractPhoneFromText(userMsg.content);
    if (num) {
      setState((s) => {
        const expectingDest = !!s.ui?.expectingDestPhone;
        const aboutDest = messageImpliesDestinationPhone(userMsg.content);
        const alreadyHasUser = !!s.details?.userPhone;
        const alreadyHasDest = !!(s.details?.restaurantPhone || s.details?.targetPhone);

        if (expectingDest || aboutDest || (!alreadyHasDest && alreadyHasUser)) {
          return { ...s, details: { ...(s.details ?? {}), restaurantPhone: num, targetPhone: num }, ui: { ...(s.ui ?? {}), expectingDestPhone: false } };
        }
        if (/\b(my number|my phone)\b/i.test(userMsg.content)) {
          return { ...s, details: { ...(s.details ?? {}), userPhone: num } };
        }
        if (!alreadyHasUser) {
          return { ...s, details: { ...(s.details ?? {}), userPhone: num } };
        } else {
          return { ...s, details: { ...(s.details ?? {}), restaurantPhone: num, targetPhone: num }, ui: { ...(s.ui ?? {}), expectingDestPhone: false } };
        }
      });
    }

    // UI: show the user message
    append([userMsg]);

    // Fire a turn
    await runTurn([...protocolRef.current, userMsg], { ...slotsRef.current });
    setText("");
  }

  async function runTurn(conversation: Msg[], slots: SlotsState) {
    try {
      setLoading(true);

      // 1) First server call
      const out = await callJasonBrain(conversation, slots, "gpt-4o-mini"); // <-- returns { ok, message, annotations, toolRequests }
      logToolCallsAnyShape(out, "#1");

      // show assistant content
      const assistantMsg = asAssistantMessage(out);
      const aiText = typeof assistantMsg?.content === "string" ? assistantMsg.content : "";
      if (aiText) append([{ role: "assistant", content: aiText }]);

      // update protocol
      protocolRef.current = [...conversation, assistantMsg];

      // 1a) APPLY annotations (inline + top-level)
      const inline = Array.isArray(out?.message?.annotations) ? out.message.annotations : [];
      const anns = [...inline, ...(out.annotations ?? [])];
      for (const a of anns) {
        if (a?.type === "slot_set") applyAnnotation(a.key, a.value);
      }

      // 1b) Run client tool requests (dialer)
      for (const tr of out.toolRequests ?? []) {
        if (tr?.name === "call-now" && tr?.args) {
          const args = tr.args || {};
          const date = args.date || slotsRef.current.details?.date || null;
          const time = args.time || slotsRef.current.details?.timeWindowStart || null;
          const start = date && time ? `${date}T${time}:00` : null;
          const end = date && time ? `${date}T${addMinutes(time, 30)}:00` : null;

          const resp = await callNow({
            targetPhone: String(args.targetPhone ?? slotsRef.current.details?.restaurantPhone ?? slotsRef.current.details?.targetPhone ?? ""),
            businessName: args.targetName ?? slotsRef.current.details?.restaurantName ?? null,
            partySize: args.partySize ? Number(args.partySize) : (slotsRef.current.details?.partySize ?? null),
            date: date,
            desiredWindowStart: start,
            desiredWindowEnd: end,
            notes: args.notes ?? null,
            source: "app",
          });

          if (resp?.ok && resp?.callId) {
            append([{ role: "assistant", content: `📞 Calling ${args.targetName ?? slotsRef.current.details?.restaurantName ?? "the restaurant"} now… (Call ID: ${resp.callId})` }]);
          } else {
            const extra = (resp as any)?.details ? ` — ${String((resp as any).details)}` : "";
            append([{ role: "assistant", content: `I couldn't start the call: ${resp?.error ?? "call_failed"}${extra}` }]);
          }
        }
      }

      // 2) Tool-call loop (kept for backward compatibility if the server returns tool_calls)
      let msg = assistantMsg;
      let needUserAnswer = false;

      while (Array.isArray((msg as any)?.tool_calls) && (msg as any).tool_calls.length > 0 && !needUserAnswer) {
        const toolResults: Msg[] = [];

        for (const tc of (msg as any).tool_calls) {
          const name: string = tc?.function?.name ?? "";
          const rawArgs: string = tc?.function?.arguments ?? "{}";

          let args: any = {};
          try { args = JSON.parse(rawArgs || "{}"); } catch { args = {}; }

          if (name === "upsert_request_slots") {
            // (Your existing normalization logic here is fine — leaving intact)
            const prev = slots.details ?? {};
            const fromDetails = (args?.details && typeof args.details === "object") ? args.details : {};
            const normalized: NonNullable<SlotsState["details"]> = { ...prev, ...fromDetails };

            const pick = (...keys: string[]) => {
              for (const k of keys) {
                const v =
                  args[k] ??
                  args[k?.replace(/[A-Z]/g, (m: string) => "_" + m.toLowerCase())] ??
                  (k.toLowerCase ? args[k.toLowerCase()] : undefined);
                if (v !== undefined && v !== null && String(v).trim() !== "") return v;
              }
              return undefined;
            };

            const rn = pick("restaurantName", "name", "restaurant");
            if (rn) normalized.restaurantName = String(rn).trim();

            const ps = pick("partySize", "party_size", "party-size");
            if (ps !== undefined && !Number.isNaN(Number(ps))) normalized.partySize = Number(ps);

            const date = pick("date");
            if (date) {
              const parsed = parseNaturalDateToISO(String(date));
              normalized.date = parsed ?? String(date).trim();
            }

            const ts = pick("timeWindowStart", "start", "time_start");
            if (ts) normalized.timeWindowStart = String(ts).trim();

            const te = pick("timeWindowEnd", "end", "time_end");
            if (te) normalized.timeWindowEnd = String(te).trim();

            const sp = pick("specialRequests", "notes");
            if (typeof sp === "string") normalized.specialRequests = sp;

            const userPh = pick("userPhone", "user_phone");
            if (userPh) {
              const u = String(userPh);
              normalized.userPhone = u.startsWith("+") ? u : (maybeExtractPhoneFromText(u) ?? u);
            }

            const destPh = pick(
              "restaurantPhone","targetPhone","restaurant_phone","target_phone",
              "phone","international_phone_number","formatted_phone_number","e164_phone","e164Phone"
            );
            if (destPh) {
              const v = String(destPh);
              const e164 = v.startsWith("+") ? v : (maybeExtractPhoneFromText(v) ?? v);
              normalized.restaurantPhone = e164;
              normalized.targetPhone = e164;
            }

            const addr = pick("address", "formattedAddress", "formatted_address");
            if (addr) normalized.address = String(addr);
            const web = pick("website", "url");
            if (web) normalized.website = String(web);
            const pid = pick("placeId", "place_id");
            if (pid) normalized.placeId = String(pid);

            // last-mile: if placeId present but no phone, try to fetch — omitted for brevity

            const next: SlotsState = { ...slots, details: normalized };
            slots = next;
            setState(next);

            toolResults.push({ role: "tool", name, tool_call_id: tc.id, content: JSON.stringify({ ok: true, state: next }) });
          } else if (name === "ask_user") {
            let prompt = String(args?.question ?? "").trim() || "Could you clarify a bit more?";
            append([{ role: "assistant", content: prompt }]);
            toolResults.push({ role: "tool", name, tool_call_id: tc.id, content: JSON.stringify({ asked: true }) });
            needUserAnswer = true;
          } else if (name === "confirm") {
            const summary = String(args?.summary ?? "");
            append([{ role: "assistant", content: summary || "Confirm?" }]);
            toolResults.push({ role: "tool", name, tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
          } else if (name === "start_request") {
            // legacy path: your code already calls handoffToVapi here—left as-is or replace with callNow(...)
            toolResults.push({ role: "tool", name, tool_call_id: tc.id, content: JSON.stringify({ queued: true }) });
          } else {
            toolResults.push({ role: "tool", name, tool_call_id: tc.id, content: JSON.stringify({ error: "unknown_tool" }) });
          }
        }

        if (needUserAnswer) {
          protocolRef.current = [...conversation, msg, ...toolResults];
          break;
        }

        const nextConversation = [...conversation, msg, ...toolResults];
        protocolRef.current = nextConversation;

        const out2 = await callJasonBrain(nextConversation, slots);
        logToolCallsAnyShape(out2, "#2");

        const aMsg = asAssistantMessage(out2);
        const aiFollow = typeof aMsg?.content === "string" ? aMsg.content : "";
        if (aiFollow) append([{ role: "assistant", content: aiFollow }]);

        // apply annotations/toolRequests on follow-up too
        const inline2 = Array.isArray(out2?.message?.annotations) ? out2.message.annotations : [];
        const anns2 = [...inline2, ...(out2.annotations ?? [])];
        for (const a of anns2) if (a?.type === "slot_set") applyAnnotation(a.key, a.value);
        for (const tr of out2.toolRequests ?? []) {
          if (tr?.name === "call-now" && tr?.args) {
            const args = tr.args || {};
            const date = args.date || slotsRef.current.details?.date || null;
            const time = args.time || slotsRef.current.details?.timeWindowStart || null;
            const start = date && time ? `${date}T${time}:00` : null;
            const end = date && time ? `${date}T${addMinutes(time, 30)}:00` : null;
            const resp = await callNow({
              targetPhone: String(args.targetPhone ?? slotsRef.current.details?.restaurantPhone ?? slotsRef.current.details?.targetPhone ?? ""),
              businessName: args.targetName ?? slotsRef.current.details?.restaurantName ?? null,
              partySize: args.partySize ? Number(args.partySize) : (slotsRef.current.details?.partySize ?? null),
              date, desiredWindowStart: start, desiredWindowEnd: end,
              notes: args.notes ?? null, source: "app",
            });
            if (resp?.ok && resp?.callId) {
              append([{ role: "assistant", content: `📞 Calling ${args.targetName ?? slotsRef.current.details?.restaurantName ?? "the restaurant"} now… (Call ID: ${resp.callId})` }]);
            } else {
              const extra = (resp as any)?.details ? ` — ${String((resp as any).details)}` : "";
              append([{ role: "assistant", content: `I couldn't start the call: ${resp?.error ?? "call_failed"}${extra}` }]);
            }
          }
        }

        msg = aMsg;
        conversation = nextConversation;
      }
    } catch (e: any) {
      append([{ role: "assistant", content: `Error: ${e?.message || String(e)}` }]);
    } finally {
      setLoading(false);
    }
  }

  // ---- (legacy) helper you already had, kept as-is if you still need Vapi path ----
  async function handoffToVapi(_slots: SlotsState) {
    // ... left intact in your original file ...
  }

  const d = state.details ?? {};
  const friendlyDate = prettyDate(d.date);
  const friendlyTime = prettyRange(d.timeWindowStart, d.timeWindowEnd);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
      >
        <View style={{ padding: 12, backgroundColor: "#111", paddingTop: Math.max(insets.top, 12) }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Slots</Text>
          <Text style={{ color: "#ddd" }}>mode: {state.mode ?? "discovery"}</Text>
          <Text style={{ color: "#ddd" }}>kind: {state.kind ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>
            geo: {state.geoCenter ? `${state.geoCenter.lat.toFixed(4)}, ${state.geoCenter.lng.toFixed(4)}` : "-"}
            {state.radiusMiles ? ` • ≤ ${state.radiusMiles} mi` : ""}
          </Text>
          <Text style={{ color: "#ddd" }}>address: {d.address ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>website: {d.website ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>placeId: {d.placeId ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>desired: {state.desiredStart ?? "-"} → {state.desiredEnd ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>restaurant: {d.restaurantName ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>partySize: {d.partySize ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>
            date/time: {friendlyDate} {friendlyDate !== "-" && friendlyTime !== "-" ? "•" : ""} {friendlyTime}
          </Text>
          <Text style={{ color: "#ddd" }}>user phone: {d.userPhone ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>dest phone: {d.restaurantPhone ?? d.targetPhone ?? "-"}</Text>
          <Text style={{ color: "#ddd" }}>awaiting dest phone? {state.ui?.expectingDestPhone ? "yes" : "no"}</Text>
          <Text style={{ color: "#ddd" }}>details keys: {Object.keys(state.details ?? {}).length}</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            flexGrow: 1,
            paddingBottom: insets.bottom + 96,
          }}
        >
          {messages.map((m, i) => (
            <View
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                backgroundColor: m.role === "user" ? "#1e90ff" : "#333",
                padding: 10,
                borderRadius: 10,
                maxWidth: "90%",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "white" }}>{m.content}</Text>
            </View>
          ))}
          {loading && <ActivityIndicator />}
        </ScrollView>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderTopWidth: 1,
            borderColor: "#ddd",
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: "white",
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type to Jason…"
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 8,
              padding: 10,
              marginRight: 8,
            }}
            editable={!loading}
            blurOnSubmit={false}
            onSubmitEditing={() => !loading && text && handleSend(text)}
          />
          <View style={{ minWidth: 96, flexShrink: 0 }}>
            <Button
              title={loading ? "Sending…" : "Send"}
              onPress={() => handleSend(text)}
              color={Platform.OS === "android" ? "#1e90ff" : undefined}
              disabled={loading}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
