// app/test-brain.tsx — minimal test screen for jason-brain
import React, { useState } from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import { callJasonBrain } from "@/lib/jasonBrain";
import { assertConfig } from "@/lib/configGuard";

export default function TestBrain() {
  assertConfig();
  const [input, setInput] = useState("Book Via Carota in New York for 2 tomorrow at 7pm. My phone +1 212 555 1234");
  const [log, setLog] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    setBusy(true);
    try {
      const resp = await callJasonBrain([{ role: "user", content: input }], {}, { dryRun: true });
      setLog(resp);
    } catch (e: any) {
      setLog({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  const anns = log?.annotations ?? log?.message?.annotations ?? [];
  const slots = log?.slots ?? {};

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>Test Jason Brain</Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Type a booking request…"
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 12, borderRadius: 8, marginBottom: 12 }}
        multiline
      />
      <Button title={busy ? "Sending…" : "Send (dry-run)"} onPress={onSend} disabled={busy} />
      {log && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Response</Text>
          <Text selectable style={{ fontFamily: "monospace" }}>{JSON.stringify(log, null, 2)}</Text>
          <Text style={{ fontSize: 18, fontWeight: "600", marginTop: 12 }}>Annotations</Text>
          {anns.length === 0 ? <Text>— none —</Text> : anns.map((a: any, i: number) => (
            <Text key={i}>• {a.type} {a.key ? `(${a.key})` : ""}: {a.value ?? ""}</Text>
          ))}
          <Text style={{ fontSize: 18, fontWeight: "600", marginTop: 12 }}>Slots</Text>
          {Object.keys(slots).length === 0 ? <Text>— none —</Text> :
            Object.entries(slots).map(([k, v]: any, i: number) => <Text key={i}>• {k}: {String(v)}</Text>)
          }
        </View>
      )}
    </ScrollView>
  );
}
