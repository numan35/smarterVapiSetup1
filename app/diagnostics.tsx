// app/diagnostics.tsx — quick sanity pings for your functions
import React, { useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import { pingFunction } from "../lib/healthPing";
import { assertConfig } from "@/lib/configGuard";

export default function Diagnostics() {
  assertConfig();
  const [out, setOut] = useState<any[]>([]);
  const tests = [
    { name: "GET /jason-brain", path: "jason-brain" },
    { name: "GET /health", path: "health" },
  ];

  const run = async () => {
    const results: any[] = [];
    for (const t of tests) {
      try {
        const r = await pingFunction(t.path, { method: (t as any).method, body: (t as any).body });
        results.push({ name: t.name, status: 200, ok: true, json: r });
      } catch (e: any) {
        results.push({ name: t.name, status: "ERR", ok: false, text: String(e?.message || e) });
      }
    }
    setOut(results);
  };

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>Diagnostics</Text>
      <Button title="Run pings" onPress={run} />
      {out.map((r, idx) => (
        <View key={idx} style={{ marginTop: 12, padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 }}>
          <Text style={{ fontWeight: "600" }}>{r.name}</Text>
          <Text>Status: {r.status} | ok: {String(r.ok)}</Text>
          {r.json ? <Text selectable style={{ fontFamily: "monospace" }}>{JSON.stringify(r.json, null, 2)}</Text>
                  : r.text ? <Text selectable>{r.text}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}
