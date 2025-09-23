// app/jason-chat.tsx
import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import callJasonBrain from "@/lib/jasonBrain"; // ✅ default import (was named)
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
function parseConfirmSummary(summary: string, fallbackIsoDate?: string) {
  const out: any = {};
  const text = summary.replace(/\s+/g, " ").trim();
  const mParty = text.match(/\b(?:for|party(?:\s*size)?[:\s])\s*(\d{1,2})\b/i);
  if (mParty) out.partySize = Number(mParty[1]);
  const mName = text.match(/\bat\s+(.+?)(?:\s+on\b|\s+for\b|,|\.|$)/i);
  if (mName) out.restaurantName = mName[1].trim();
  const mPhone = text.match(/(?:\+?\d[\d\-\s]{8,}\d)/);
  if (mPhone) out.userPhone = maybeExtractPhoneFromText(mPhone[0]);
  const dateIso = parseNaturalDateToISO(text, fallbackIsoDate);
  if (dateIso) out.date = dateIso;
  const mRange = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (mRange) {
    const s = to24h(mRange[1].toUpperCase());
    const e = to24h(mRange[2].toUpperCase());
    if (s) out.timeWindowStart = s;
    if (e) out.timeWindowEnd = e;
  } else {
    const mAt = text.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
    if (mAt) { const s = to24h(mAt[1].toUpperCase()); if (s) { out.timeWindowStart = s; out.timeWindowEnd = addMinutes(s, 30); } }
  }
  return out;
}
function parseISOishDateTime(s?: string | null) {
  if (!s) return null;
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return { date: m[1], time: `${m[2]}:${m[3]}` };
}

// Intent heuristics: destination phone?
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

// ---------- Places phone fetch ----------
async function fetchPhoneByPlaceId(placeId?: string): Promise<string | undefined> {
  if (!placeId || !functionsBase || !supabaseAnonKey) return undefined;
  try {
    const url = `${functionsBase}/find-business/details?place_id=${encodeURIComponent(placeId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const item = data?.item ?? {};
    return item?.e164_phone || item?.formatted_phone || undefined;
  } catch {
    return undefined;
  }
}

export default function JasonChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi, I'm Jason. What would you like me to do?" },
  ]);

  // ✅ protocol transcript (what we send to the model)
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

  function append(msgs: Msg[]) {
    setMessages((m) => [...m, ...msgs]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 10);
  }

 async function handleSend(input: string) {
  if (!input.trim() || loading) return;

  const userMsg: Msg = { role: "user", content: input.trim() };

  // --- decide mode (discovery vs booking)
  const lower = userMsg.content.toLowerCase();
  const showsBookingIntent =
    /\b(book|reserve|reservation|call (?:and )?make|make (?:a )?reservation|hold a table|please call)\b/.test(lower) ||
    /\b(let'?s do|go with|choose|pick)\b/.test(lower);

  setState((s) => ({
    ...s,
    mode: showsBookingIntent ? "booking" : (s.mode ?? "discovery"),
  }));

  // --- geo hints (optional — keep if useful)
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

  // --- show user message in chat
  append([userMsg]);
  setText("");

  // --- optional slot hints (do NOT block send)
  // Pull any known defaults from state and a lightweight phone scrape from the message.
  const knownCity = state?.city || undefined; // if you track a default city in state
  const knownPhone = state?.userPhone || undefined;

  // try to extract a phone from the user message (very light; server will re-validate)
  const msgPhoneMatch = userMsg.content.match(/\+?[1-9]\d{6,14}/);
  const hintedUserPhone = msgPhoneMatch?.[0] || knownPhone;

  const slotHints: Record<string, any> = {
    ...(knownCity ? { city: knownCity } : {}),
    ...(hintedUserPhone ? { userPhone: hintedUserPhone } : {}),
    ...(state?.geoCenter ? { lat: state.geoCenter.lat, lng: state.geoCenter.lng } : {}),
    ...(state?.radiusMiles ? { radiusMiles: state.radiusMiles } : {}),
  };

  // --- call Jason with full transcript + non-blocking hints
 // --- call Jason with full transcript + optional hints
await runTurn(
  [...protocolRef.current, userMsg],
  {
    ...slotsRef.current,       // keep existing slots
    city: "New York",          // optional hint
    userPhone: "+1 212 555 1234" // optional hint
  }
);

}


 async function runTurn(conversation: Msg[], slots: SlotsState) {
  try {
    setLoading(true);

    // Call Jason Brain
    let m = await callJasonBrain(conversation, slots);
    logToolCallsAnyShape(m, "#1");

    // Include this assistant message in the protocol
    protocolRef.current = [...conversation, m];

    // 🔎 Harvest slot_set annotations from this assistant message
    if (Array.isArray(m?.annotations)) {
      const next = { ...(slots.details ?? {}) };
      for (const a of m.annotations) {
        if (a?.type === "slot_set" && a.key) {
          next[a.key] = a.value;
        }
      }
      setState((s) => ({ ...s, details: next }));
    }

    // Guard for AI text
    let aiText = (m?.content && typeof m.content === "string") ? m.content : "";
    if (
      (slotsRef.current.mode ?? "discovery") === "discovery" &&
      /\b(date|time|party size|how many)\b/i.test(aiText) &&
      /\b(suggest|recommend|best|options|near|in )/i.test(conversation[conversation.length - 1]?.content || "")
    ) {
      aiText = "Got it — I’ll suggest nearby options first. Any price range or vibe you prefer?";
    }
    if (aiText) append([{ role: "assistant", content: aiText }]);

    // … keep the rest of your while-loop for tool_calls here …
  } catch (e: any) {
    append([{ role: "assistant", content: `Error: ${e?.message || String(e)}` }]);
  } finally {
    setLoading(false);
  }
}

  const d = state.details ?? {};
  const friendlyDate = prettyDate(d.date);
  const friendlyTime = prettyRange(d.timeWindowStart, d.timeWindowEnd);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
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
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, paddingBottom: insets.bottom + 96 }}
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
            gap: 8,
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
            style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 }}
            editable={!loading}
            blurOnSubmit={false}
            onSubmitEditing={() => !loading && text && handleSend(text)}
          />
          <Button title="Send" onPress={() => handleSend(text)} disabled={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
