// app/test-brain.tsx
import { useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import callJasonBrain from "@/lib/jasonBrain";

type Msg = { role: "user" | "assistant" | "tool"; content: string };

function extractSlots(payload: any) {
  const out: Record<string, any> = {};
  const anns = payload?.message?.annotations ?? [];
  for (const a of anns) if (a?.type === "slot_set" && a.key) out[a.key] = a.value;
  return out;
}

export default function TestBrain() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [slots, setSlots] = useState<Record<string, any>>({});

  async function run(messages: Msg[], seedSlots: Record<string, any> = {}) {
    try {
      setBusy(true);
      setError(null);
      const p = await callJasonBrain(messages, seedSlots);
      setPayload(p);
      setSlots(extractSlots(p));
      console.log("brain payload:", p);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.log("brain error:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Jason Brain Test</Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          title={busy ? "Running…" : "Opinion"}
          disabled={busy}
          onPress={() => run([{ role: "user", content: "I’m in New York. Any cozy Italian spots you recommend?" }], { city: "New York" })}
        />
        <Button
          title={busy ? "Running…" : "Book Via Carota"}
          disabled={busy}
          onPress={() =>
            run([{ role: "user", content: "Book Via Carota for 2 tomorrow at 19:00. My phone is +1 212 555 1234." }], { city: "New York" })
          }
        />
        <Button
          title={busy ? "Running…" : "Dry-run check"}
          disabled={busy}
          onPress={() => run([{ role: "user", content: "ping" }], { city: "New York" })}
        />
      </View>

      {error ? <Text style={{ color: "red" }}>Error: {error}</Text> : null}

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Assistant</Text>
      <ScrollView style={{ maxHeight: 120, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text>
          {payload?.message?.content ?? "(press one of the buttons above)"}
        </Text>
      </ScrollView>

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Slots</Text>
      <ScrollView style={{ maxHeight: 120, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text selectable>{JSON.stringify(slots, null, 2)}</Text>
      </ScrollView>

      <Text style={{ marginTop: 8, fontWeight: "600" }}>Raw (preview)</Text>
      <ScrollView style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
        <Text selectable>{JSON.stringify(payload, null, 2)}</Text>
      </ScrollView>
    </View>
  );
}
