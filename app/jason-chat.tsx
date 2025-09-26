// app/jason-chat.tsx — chat UI + toolRequests wiring
import React, { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { callJasonBrain, JasonResponse } from "@/lib/jasonBrain";
import { callNow } from "@/services/callNow";

type Msg = { role: "user" | "assistant"; content: string };

// --- Helpers to apply slot annotations coming from Jason ---
function applyAnnotations(slots: Record<string, any>, anns?: any[]) {
  const next = { ...slots };
  (anns || []).forEach((a: any) => {
    if (a?.type === "slot_set" && a.key) next[a.key] = a.value;
  });
  return next;
}

const REQUIRED = ["restaurant","city","date","time","party_size"] as const;
function hasRequired(slots: Record<string, any>) {
  return REQUIRED.every(k => slots && slots[k] !== undefined && slots[k] !== null && String(slots[k]).trim() !== "");
}

export default function JasonChat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I can help you make restaurant reservations. Tell me what you need." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<Record<string, any>>({});
  const [hasDialed, setHasDialed] = useState(false);

  async function maybeDialFromToolOrSlots(res: JasonResponse) {
    try {
      // 1) Prefer explicit tool request from Jason
      const toolReqs: any[] = Array.isArray(res?.toolRequests) ? res.toolRequests : [];
      const callReq = toolReqs.find((t) => t && t.type === "call_now");

      if (callReq && !hasDialed) {
        console.log("☎️ ToolRequest: call_now", callReq);
        const r = await callNow({
          targetPhone: callReq.targetPhone || "+18623687383", // server redirect still applies
          targetName: callReq.targetName || (slots.restaurant ?? "Restaurant"),
          notes: callReq.notes || `City:${slots.city}; Date:${slots.date}; Time:${slots.time}; Party:${slots.party_size}`,
        });
        if (r?.ok) {
          setHasDialed(true);
          Alert.alert("Calling", "Jason is placing the call now.");
        } else {
          Alert.alert("Call failed", r?.error || "Unknown error");
        }
        return;
      }

      // 2) Fallback: if all required slots are present but no toolRequests
      const merged = res?.slots || slots;
      if (!hasDialed && hasRequired(merged)) {
        console.log("☎️ Fallback dialing based on slots", merged);
        const r = await callNow({
          targetPhone: "+18623687383",
          targetName: String(merged.restaurant || "Restaurant"),
          notes: `City:${merged.city}; Date:${merged.date}; Time:${merged.time}; Party:${merged.party_size}`,
        });
        if (r?.ok) {
          setHasDialed(true);
          Alert.alert("Calling", "Jason is placing the call now.");
        } else {
          Alert.alert("Call failed", r?.error || "Unknown error");
        }
      }
    } catch (e) {
      console.warn("maybeDialFromToolOrSlots error", e);
    }
  }

  async function send() {
    if (!input.trim()) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const res = await callJasonBrain(
        messages.concat(userMsg).map((m) => ({ role: m.role, content: m.content })),
        slots
      );
      if (!res?.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res?.error || "Sorry, something went wrong." }]);
        setBusy(false);
        return;
      }

      // Apply slot annotations and update UI
      const anns = res?.message?.annotations || res?.annotations || [];
      const merged = applyAnnotations(slots, anns);
      setSlots(merged);

      // Append assistant message
      const assistantText = res?.message?.content || "";
      setMessages((m) => [...m, { role: "assistant", content: assistantText }]);

      // Try to dial based on toolRequests or merged slots
      await maybeDialFromToolOrSlots(res);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e?.message || String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, padding: 16 }}>
          <ScrollView style={{ flex: 1 }}>
            {messages.map((m, i) => (
              <View key={i} style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: "700", color: m.role === "user" ? "#2563eb" : "#111827" }}>
                  {m.role === "user" ? "You" : "Jason"}
                </Text>
                <Text>{m.content}</Text>
              </View>
            ))}
          </ScrollView>

          {busy && <ActivityIndicator style={{ marginBottom: 8 }} />}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Type your request..."
              style={{ flex: 1, borderWidth: 1, padding: 12, borderRadius: 10 }}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={send}
              disabled={busy || !input.trim()}
              style={{ backgroundColor: busy ? "#9ca3af" : "#111827", paddingHorizontal: 16, borderRadius: 10, justifyContent: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
