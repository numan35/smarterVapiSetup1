// app/jason-chat.tsx — robust error display
import React, { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { callJasonBrain, JasonResponse } from "@/lib/jasonBrain";
import { callNow } from "@/services/callNow";
import Constants from "expo-constants";

const REQUIRED = ["restaurant","city","date","time","party_size"];
function readyToDial(slots: Record<string, any>) {
  return REQUIRED.every(k => slots && slots[k]);
}
function applyAnnotations(slots: Record<string, any>, anns?: any[]) {
  const next = { ...slots };
  (anns || []).forEach((a: any) => {
    if (a?.type === "slot_set" && a.key) next[a.key] = a.value;
  });
  return next;
}

export default function JasonChat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I can help you make restaurant reservations. Tell me what you need." },
  ]);
  const [input, setInput] = useState("");
  
  const [hasDialed, setHasDialed] = useState(false);
const [slots, setSlots] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const reqIdRef = useRef<string | null>(null);

  const send = async () => {
    if (busy || !input.trim()) return;
    setBusy(true);
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const requestId = crypto.randomUUID();
    reqIdRef.current = requestId;

    let res: JasonResponse | null = null;
    try {
      res = await callJasonBrain(
        [...messages, userMsg],
        slots,
        { requestId }
      );
    } catch (e: any) {
      // Hard exception (should be rare with safe wrapper)
      setMessages((prev) => [...prev, { role: "assistant", content: `Jason error (exception): ${String(e?.message ?? e)}` }]);
      setBusy(false);
      return;
    }

    if (!res || res.ok === false) {
      const err = res?.error || "Unknown error";
      setMessages((prev) => [...prev, { role: "assistant", content: `Jason error: ${err}` }]);
      setBusy(false);
      return;
    }

    // Merge message(s)
    let newAssistantMsgs: Msg[] = [];
    if (res.messagesDelta && Array.isArray(res.messagesDelta)) {
      newAssistantMsgs = res.messagesDelta
        .filter((m: any) => m?.role === "assistant" && typeof m?.content === "string")
        .map((m: any) => ({ role: "assistant", content: String(m.content) }));
    } else if (res.message?.role === "assistant") {
      newAssistantMsgs = [{ role: "assistant", content: String(res.message.content || "") }];
    }
    if (newAssistantMsgs.length === 0) {
      newAssistantMsgs = [{ role: "assistant", content: "(no assistant content returned)" }];
    }

    const nextMessages = [...messages, userMsg, ...newAssistantMsgs];
    setMessages(nextMessages);

    // Apply annotations → slots (prefer canonical from server)
    const nextSlots = applyAnnotations(slots, res.annotations);
    setSlots(res.slots && typeof res.slots === "object" ? { ...nextSlots, ...res.slots } : nextSlots);

    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {messages.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: 10, borderRadius: 10, backgroundColor: m.role === "user" ? "#DCF2FF" : "#f1f5f9" }}>
              <Text>{m.content}</Text>
            </View>
          ))}
          {busy && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator />
              <Text>Contacting Jason…</Text>
            </View>
          )}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", padding: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
              placeholder="Type your request…"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={send} disabled={busy || !input.trim()} style={{ backgroundColor: busy || !input.trim() ? "#cbd5e1" : "#2563eb", paddingHorizontal: 16, borderRadius: 10, justifyContent: "center" }}>
              <Text style={{ color: "white", fontWeight: "700" }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
