// app/test-brain.tsx
import { useEffect, useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import callJasonBrain from "@/lib/jasonBrain"; // keep alias if you configured it; otherwise use ../lib/jasonBrain

type Msg = { role: "user" | "assistant" | "tool"; content: string; name?: string; tool_call_id?: string };

function extractSlots(payload: any) {
  const slots: Record<string, any> = {};
  const anns = payload?.message?.annotations ?? [];
  for (const a of anns) if (a?.type === "slot_set" && a.key) slots[a.key] = a.value;
  return slots;
}

export default function TestBrain() {
  const [lastPayload, setLastPayload] = useState<any>(null);
  const [lastSlots, setLastSlots] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runOnce(messages: Msg[], seedSlots: Record<string, any> = {}) {
    try {
      setBusy(true);
      setError(null);
      const payload = await callJasonBrain(messages, seedSlots);
      setLastPayload(payload);
      setLastSlots(extractSlots(payload));
      console.log("brain payload:", payload);
      console.log("extracted slots:", extractSlots(payload));
    } catch (e: any) {
      setError(e?.message || String(e));
      console.log("brain error:", e);
    } finally {
      setBusy(false);
    }
  }

  // Auto-run a tiny hello on mount so you see something immediately
  useEffect(() => {
    runOnce([{ role: "user", content: "Say hello briefly." }], {});
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Jason Brain Test</Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          title={busy ? "Running…" : "Opinion (NYC Italian)"}
          disabled={busy}
          onPress={() =>
            runOnce([{ role: "user", content: "I’m in New York. Any cozy Italian spots you recommend?" }], {
              city: "New York",
            })
          }
        />
        <Button
          title={busy ? "Running…" : "Book Via Carota"}
          disabled={busy}
          onPress={() =>
            runOnce(
              [{ role: "user", content: "Book Via Carota for 2 tomorrow at 19:00. My phone is +1 212 555 1234." }],
              { city: "New York" }
            )
          }
        />
      </View>

      {error ? <Text style={{ color: "red" }}>Error: {error}</Text> : null}

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Assistant Message</Text>
      <ScrollView style={{ maxHeight: 120, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text>
          {lastPayload?.message?.content ??
            "(no message yet — press a button above, then check your device logs too)"}
        </Text>
      </ScrollView>

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Extracted Slots (from message.annotations)</Text>
      <ScrollView style={{ maxHeight: 120, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text>{JSON.stringify(lastSlots, null, 2)}</Text>
      </ScrollView>

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Raw Payload (preview)</Text>
      <ScrollView style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text selectable>{JSON.stringify(lastPayload, null, 2)}</Text>
      </ScrollView>
    </View>
  );
}
