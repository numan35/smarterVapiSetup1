import { useState } from "react";
import { View, Text, Button, ScrollView, ActivityIndicator } from "react-native";
import { callJasonBrain } from "@/lib/jasonBrain";

export default function TestBrainScreen() {
  const [out, setOut] = useState<string>("(no output yet)");
  const [loading, setLoading] = useState(false);

  async function runTest() {
    try {
      setLoading(true);
      const m = await callJasonBrain([{ role: "user", content: "Hi Jason! One-sentence hello." }]);
      // m should be an OpenAI-style message
      setOut(JSON.stringify(m, null, 2));
      console.log("Jason says:", m);
    } catch (e: any) {
      setOut(`ERROR: ${e?.message || String(e)}`);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Jason Brain Test</Text>
      <Button title={loading ? "Running…" : "Run test"} onPress={runTest} disabled={loading} />
      {loading && <ActivityIndicator />}
      <View style={{ padding: 12, backgroundColor: "#111", borderRadius: 8 }}>
        <Text selectable style={{ color: "#eee", fontFamily: "monospace" }}>
          {out}
        </Text>
      </View>
      <Text style={{ opacity: 0.6 }}>
        Tip: open your dev console to see the raw object too.
      </Text>
    </ScrollView>
  );
}
