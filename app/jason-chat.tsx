// app/jason-chat.tsx
// Jason Chat Screen — client overhaul
// - Busy/pending guard to prevent duplicate sends
// - Idempotent requestId per turn
// - Canonical messages[] maintenance (append assistant + user)
// - Slots reducer from annotations (whitelist + type coercion)
// - Each call sends: { threadId, requestId, messages, slots }
// - Confirmation-friendly flow but UI remains minimal and clean

import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

// You should already have these in your repo:
import callJasonBrain from "@/lib/jasonBrain"; // server call wrapper, returns { ok, message, annotations, slots, messagesDelta, next_action, toolRequests }
import { callNow } from "@/services/callNow"; // optional; only used after explicit confirmation

type Role = "system" | "user" | "assistant" | "tool";

type Msg = { role: Role; content: string };

type Geo = { lat: number; lng: number };

type Slots = {
  restaurant?: string;
  placeId?: string;
  address?: string;
  website?: string;
  destPhone?: string;
  city?: string;
  geo?: Geo;
  partySize?: number;
  date?: string; // yyyy-mm-dd
  time?: string; // HH:mm
  userPhone?: string;
  notes?: string;
};

type Annotation =
  | { type: "slot_set"; key: keyof Slots; value: any; confidence?: number }
  | { type: "intent"; value: "chitchat" | "suggest" | "booking" }
  | { type: "tool_call"; name: string; args?: Record<string, any> };

const ALLOWED_SLOT_KEYS: (keyof Slots)[] = [
  "restaurant",
  "placeId",
  "address",
  "website",
  "destPhone",
  "city",
  "geo",
  "partySize",
  "date",
  "time",
  "userPhone",
  "notes",
];

function uuidish() {
  // light, local idempotency id
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function coerceSlots(prev: Slots, key: keyof Slots, value: any): Slots {
  const next: Slots = { ...prev };
  switch (key) {
    case "partySize": {
      const n = typeof value === "number" ? value : parseInt(String(value).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(n) && n > 0 && n <= 20) next.partySize = n;
      break;
    }
    case "restaurant": {
      if (typeof value === "string" && value.trim() && !/^\d+(\s+\d+)?$/.test(value.trim())) {
        next.restaurant = value.trim();
      }
      break;
    }
    case "userPhone":
    case "destPhone": {
      const s = String(value || "").replace(/[^\d+]/g, "");
      if (s.length >= 7) (next as any)[key] = s;
      break;
    }
    case "geo": {
      if (value && typeof value.lat === "number" && typeof value.lng === "number") next.geo = { lat: value.lat, lng: value.lng };
      break;
    }
    default: {
      if (ALLOWED_SLOT_KEYS.includes(key) && value !== undefined && value !== null && String(value).trim() !== "") {
        (next as any)[key] = value;
      }
    }
  }
  return next;
}

function applyAnnotations(baseSlots: Slots, annotations: Annotation[] | undefined | null): Slots {
  let slots = { ...baseSlots };
  if (!annotations) return slots;
  for (const a of annotations) {
    if (a && a.type === "slot_set") {
      const k = a.key;
      if (ALLOWED_SLOT_KEYS.includes(k)) {
        slots = coerceSlots(slots, k, (a as any).value);
      }
    }
  }
  return slots;
}


function formatPhone(s?: string) {
  if (!s) return "";
  const d = s.replace(/[^\d+]/g, "");
  return d;
}

function SlotRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: "#374151" }}>{label}</Text>
      <Text style={{ fontWeight: "600", color: "#111827" }}>{value}</Text>
    </View>
  );
}


function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: ok ? "#DCFCE7" : "#F3F4F6", marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: ok ? "#14532D" : "#374151", fontWeight: "600" }}>{ok ? "✓ " : "• "}{label}</Text>
    </View>
  );
}

function StatusChips({ slots }: { slots: any }) {
  const hasRestaurant = !!slots?.restaurant;
  const hasDetails = !!(slots?.placeId || slots?.destPhone || slots?.address);
  const hasParty = !!slots?.partySize;
  const hasDate = !!slots?.date;
  const hasTime = !!slots?.time;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
      <Chip ok={hasRestaurant} label="Restaurant" />
      <Chip ok={hasDetails} label="Place details" />
      <Chip ok={hasParty} label="Party size" />
      <Chip ok={hasDate} label="Date" />
      <Chip ok={hasTime} label="Time" />
    </View>
  );
}

function SlotPanel({ slots }: { slots: any }) {
  const date = slots?.date;
  const time = slots?.time;
  const partySize = slots?.partySize ? String(slots.partySize) : "";
  const phone = formatPhone(slots?.destPhone);
  const userPhone = formatPhone(slots?.userPhone);
  const addr = slots?.address || "";
  const rest = slots?.restaurant || "";
  const website = slots?.website || "";
  const placeId = slots?.placeId || "";

  return (
    <View style={{ padding: 12, backgroundColor: "#F9FAFB", borderTopWidth: 1, borderColor: "#EEE", borderRadius: 10, marginBottom: 8 }}>
      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Reservation Details</Text>
      <SlotRow label="Restaurant" value={rest} />
      <SlotRow label="Address" value={addr} />
      <SlotRow label="Phone" value={phone} />
      <SlotRow label="Website" value={website} />
      <SlotRow label="Place ID" value={placeId} />
      <SlotRow label="Party Size" value={partySize} />
      <SlotRow label="Date" value={date} />
      <SlotRow label="Time" value={time} />
      <SlotRow label="Your Phone" value={userPhone} />
    </View>
  );
}

export default function JasonChatScreen() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I can help you make restaurant reservations. Tell me what you need." },
  ]);
  const [slots, setSlots] = useState<Slots>({});
  const [threadId] = useState<string>(() => uuidish());
  const pendingRef = useRef(false);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Busy guard
    if (pendingRef.current) return;
    pendingRef.current = true;

    try {
      // 1) Append the user's message locally
      const userMsg: Msg = { role: "user", content: text };
      const historyBefore = [...messages, userMsg];
      setMessages(historyBefore);
      setInput("");

      // 2) Prepare idempotent request
      const requestId = uuidish();

      // 3) Call server with canonical state
      const payload = {
        threadId,
        requestId,
        messages: historyBefore, // includes assistant & user turns
        slots,
      };

      const res = await callJasonBrain(payload);

      // 4) Merge response
      // Prefer messagesDelta if present; otherwise fall back to { message }
      let newAssistantMsgs: Msg[] = [];
      if (res?.messagesDelta && Array.isArray(res.messagesDelta)) {
        newAssistantMsgs = res.messagesDelta.filter((m: any) => m?.role === "assistant").map((m: any) => ({ role: "assistant", content: String(m.content || "") }));
      } else if (res?.message?.role === "assistant") {
        newAssistantMsgs = [{ role: "assistant", content: String(res.message.content || "") }];
      }

      
      if (res && res.ok === false && res.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Jason error: ${String(res.error)}` }]);
      }
const nextMessages = [...historyBefore, ...newAssistantMsgs];
      setMessages(nextMessages);

      // 5) Apply annotations → slots
      const nextSlots = applyAnnotations(slots, res?.annotations);
      // If server returns canonical slots, prefer them
      const canonical = res?.slots && typeof res.slots === "object" ? res.slots : null;
      setSlots(canonical ? { ...nextSlots, ...canonical } : nextSlots);

      // 6) Auto-actions are handled server-side; client remains simple.
      // Confirmation is a separate UX path; we only render assistant text here.

    } catch (e: any) {
      /* SNAG_ERROR_SURFACE */
      const msg = (e?.message || e) ? `Jason error: ${String(e?.message ?? e)}` : "Jason failed";
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I hit a snag talking to Jason Brain. Try again." }]);
      console.error("Jason send error:", e);
    } finally {
      pendingRef.current = false;
    }
  }, [input, messages, slots, threadId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 12 }}
            onContentSizeChange={() => {}}
          >
            {messages.map((m, idx) => (
              <View key={idx} style={{ marginBottom: 10, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                <View
                  style={{
                    maxWidth: "85%",
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: m.role === "user" ? "#E6F0FF" : "#F3F4F6",
                  }}
                >
                  <Text style={{ color: "#111827" }}>{m.content}</Text>
                </View>
              </View>
            ))}
            {pendingRef.current && (
              <View style={{ marginTop: 8 }}>
                <ActivityIndicator />
              </View>
            )}
          </ScrollView>

          
          <SlotPanel slots={slots} />

          {/* <View style={{ padding: 8, backgroundColor: "#fafafa", borderTopWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600", marginBottom: 4 }}>Slots</Text>
            <Text selectable>{JSON.stringify(slots, null, 2)}</Text>
          </View> */}

          <View style={{ flexDirection: "row", paddingVertical: 8, gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              placeholder="Type a message…"
              value={input}
              onChangeText={setInput}
              editable={!pendingRef.current}
              onSubmitEditing={onSend}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={onSend}
              disabled={pendingRef.current || !input.trim()}
              style={{
                backgroundColor: pendingRef.current || !input.trim() ? "#cbd5e1" : "#2563eb",
                paddingHorizontal: 16,
                borderRadius: 10,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
