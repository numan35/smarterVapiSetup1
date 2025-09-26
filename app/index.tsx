// app/index.tsx
import { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, Alert } from 'react-native';
import { useRouter, Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { callNow } from '@/services/callNow';
import { Link } from 'expo-router';

export default function Home() {
  const router = useRouter();

  const [targetName, setTargetName] = useState('Sample Tire Shop');
  const [targetPhone, setTargetPhone] = useState('+14045551234'); // E.164
  const [notes, setNotes] = useState('Ask for 4 tires, 235/45R18, installed.');
  const [loading, setLoading] = useState(false);
  const [lastCallId, setLastCallId] = useState<string | null>(null);

  const onCall = async () => {
    try {
      setLoading(true);
      const res = await callNow({ targetName, targetPhone, notes, source: 'app' });
      if (!res.ok) throw new Error(res.error);
      setLastCallId(res.callId ?? null);
      Alert.alert('Call started', `Call ID: ${res.callId ?? 'unknown'}`);
      if (res.callId) router.push(`/call/${res.callId}`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Call failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Outbound Call (MVP)</Text>

      <TextInput
        placeholder="Business name"
        value={targetName}
        onChangeText={setTargetName}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <TextInput
        placeholder="+14045551234"
        value={targetPhone}
        onChangeText={setTargetPhone}
        keyboardType="phone-pad"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <TextInput
        placeholder="Notes for the assistant"
        value={notes}
        onChangeText={setNotes}
        multiline
        style={{ borderWidth: 1, padding: 10, borderRadius: 8, minHeight: 80 }}
      />

      {loading ? <ActivityIndicator /> : <Button title="Call now" onPress={onCall} />}

      <View style={{ height: 8 }} />
      <Button title="Open Demo" onPress={() => WebBrowser.openBrowserAsync('https://example.com/demo')} />

      <View style={{ height: 8 }} />
      <Button
        title="Open Call Details"
        onPress={() => {
          if (lastCallId) router.push(`/call/${lastCallId}`);
          else Alert.alert('No call yet', 'Start a call first to view details.');
        }}
        disabled={!lastCallId}
      />

      <View style={{ height: 16 }} />
      <Button title="Recent Calls" onPress={() => router.push('/recent')} />

      {/* Links to Jason test + chat */}
      <View style={{ height: 16 }} />
      <Link href="/test-brain" asChild>
        <Button title="Open Jason Brain Test" />
      </Link>

      <View style={{ height: 8 }} />
      <Link href="/jason-chat" asChild>
        <Button title="Open Jason Chat" />
      </Link>
    </View>
  );
}
