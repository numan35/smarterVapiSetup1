// app/jason-chat.tsx — chat UI + toolRequests wiring + visible debug panel
import React, { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { callJasonBrain, JasonResponse } from "@/lib/jasonBrain";
import { callNow } from "@/services/callNow";

type Msg = { role: "user" | "assistant"; content: string };

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

async function pingJason() {
  const BASE = "https://lkoogdveljyxwweranaf.functions.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb29nZHZlbGp5eHd3ZXJhbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NjQ1MDEsImV4cCI6MjA3MjU0MDUwMX0.gER6-spRheuIzCe_ET-ntaklbRQHkmGb75I3UJkFYKs";

  try {
    const r = await fetch(`${BASE}/jason-brain`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        // React Native does NOT auto-set Origin; if your function checks it, set it:
        Origin: "http://localhost:19006",
      },
    });
    const text = await r.text();
    console.log("PING status", r.status, "body:", text);
  } catch (e: any) {
    console.log("PING error", e?.message ?? e);
  }
}


export default function JasonChat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I can help you make restaurant reservations. Tell me what you need." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<Record<string, any>>({});
  const [hasDialed, setHasDialed] = useState(false);
  const [lastTool, setLastTool] = useState<any>(null);

  async function maybeDialFromToolOrSlots(res: JasonResponse, mergedSlots: Record<string, any>) {
    try {
      const toolReqs: any[] = Array.isArray(res?.toolRequests) ? res.toolRequests : [];
      const callReq = toolReqs.find((t) => t && t.type === "call_now");
      setLastTool(callReq || null);

      if (callReq && !hasDialed) {
        console.log("☎️ ToolRequest: call_now", callReq);
        Alert.alert("ToolRequest detected", JSON.stringify(callReq, null, 2));
        const r = await callNow({
          targetPhone: callReq.targetPhone || "+18623687383",
          targetName: callReq.targetName || (mergedSlots.restaurant ?? "Restaurant"),
          notes: callReq.notes || `City:${mergedSlots.city}; Date:${mergedSlots.date}; Time:${mergedSlots.time}; Party:${mergedSlots.party_size}`,
        });
        if (r?.ok) {
          setHasDialed(true);
          Alert.alert("Calling", "Jason is placing the call now.");
        } else {
          Alert.alert("Call failed", r?.error || "Unknown error");
        }
        return;
      }

      if (!hasDialed && hasRequired(mergedSlots)) {
        console.log("☎️ Fallback dialing based on slots", mergedSlots);
        Alert.alert("Slots complete", "Dialing based on slots.");
        const r = await callNow({
          targetPhone: "+18623687383",
          targetName: String(mergedSlots.restaurant || "Restaurant"),
          notes: `City:${mergedSlots.city}; Date:${mergedSlots.date}; Time:${mergedSlots.time}; Party:${mergedSlots.party_size}`,
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
      Alert.alert("Error", String(e));
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

      const anns = res?.message?.annotations || res?.annotations || [];
      const merged = applyAnnotations(slots, anns);
      setSlots(merged);

      const assistantText = res?.message?.content || "";
      setMessages((m) => [...m, { role: "assistant", content: assistantText }]);

      console.log("🔍 toolRequests:", res?.toolRequests);
      console.log("🔍 merged slots:", merged);

      await maybeDialFromToolOrSlots(res, merged);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e?.message || String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  // Visible debug panel
  const debugJson = JSON.stringify({ slots, hasDialed, lastTool }, null, 2);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Debug Box */}
          <View style={{ backgroundColor: "#f3f4f6", borderRadius: 8, padding: 8, marginBottom: 8 }}>
            <Text style={{ fontWeight: "700", marginBottom: 4 }}>Debug</Text>
            <Text selectable>{debugJson}</Text>
            <View style={{ height: 8 }} />
            <TouchableOpacity
              onPress={async () => {
                Alert.alert("Force Call", "Attempting callNow()");
                const r = await callNow({
                  targetPhone: "+18623687383",
                  targetName: String(slots.restaurant || "Restaurant"),
                  notes: `City:${slots.city}; Date:${slots.date}; Time:${slots.time}; Party:${slots.party_size}`,
                });
                Alert.alert("Force Call result", r?.ok ? `OK (callId ${r.callId})` : (r?.error || "Unknown error"));
              }}
              style={{ backgroundColor: "#111827", padding: 10, borderRadius: 8, alignSelf: "flex-start" }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Force Call Now</Text>
            </TouchableOpacity>
          </View>

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
