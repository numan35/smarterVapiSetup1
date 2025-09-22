// app/jason-chat.tsx — production screen with tolerant response handling + logging + input + Call Now

import React, { useCallback, useState } from 'react';
import { View, Text, Button, ScrollView, Alert, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import callJasonBrain, { type BrainAnnotation, type BrainPayload, type BrainResponse } from '@/lib/jasonBrain';
import callNow from '@/services/callNow';

// Chat message type (align with your existing one if different)
export type ChatMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
  annotations?: BrainAnnotation[];
};

export default function JasonChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slots, setSlots] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const applyAnnotationsToSlots = useCallback((anns: BrainAnnotation[]) => {
    if (!Array.isArray(anns) || anns.length === 0) return;
    const updates: Record<string, any> = {};
    anns.forEach((ann) => {
      if (ann && ann.type === 'slot_set' && ann.key) {
        updates[ann.key] = ann.value;
      } else {
        console.log('[chat] ignoring annotation', ann);
      }
    });
    if (Object.keys(updates).length) {
      setSlots((prev) => ({ ...prev, ...updates }));
      console.log('[chat] applied slot updates:', updates);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInput('');

    setBusy(true);
    let out: BrainResponse | null = null;
    try {
      const payload: BrainPayload = { messages: [...messages, userMsg], slots };
      out = await callJasonBrain(payload);
    } catch (e: any) {
      console.error('[chat] callJasonBrain threw', e?.message || e);
      setBusy(false);
      return Alert.alert('Jason error', e?.message || 'Network error');
    }

    const inlineAnns = Array.isArray(out?.message?.annotations) ? out!.message!.annotations! : [];
    const topAnns = Array.isArray(out?.annotations) ? out!.annotations! : [];
    console.log('[chat] annotations inline=%d top=%d', inlineAnns.length, topAnns.length);

    const allAnns = [...inlineAnns, ...topAnns];
    if (allAnns.length) {
      try { applyAnnotationsToSlots(allAnns); } catch (e) { console.warn('[chat] failed to apply annotations', e); }
    }

    const assistantText =
      (out?.message && typeof out.message.content === 'string' && out.message.content.trim()) ||
      (allAnns.length ? 'Got it — updated the details.' : '');

    if (assistantText) {
      addMessage({
        id: crypto.randomUUID?.() ?? String(Date.now()),
        role: 'assistant',
        content: assistantText,
        createdAt: new Date().toISOString(),
        annotations: inlineAnns,
      });
    } else {
      console.warn('[chat] no assistant content and no annotations; full payload:', out);
    }

    if (out && out.ok === false) {
      const msg = `${out.error ?? 'Unknown error'}${out.status ? ` (${out.status})` : ''}`;
      console.warn('[chat] brain error:', msg, out);
      Alert.alert('Jason Brain error', msg);
    }

    setBusy(false);
  }, [input, messages, slots, addMessage, applyAnnotationsToSlots]);

  const handleCallNow = useCallback(async () => {
    const targetPhone = slots.targetPhone || slots.restaurantPhone;
    if (!targetPhone) return Alert.alert('Missing phone', 'No restaurant phone captured yet.');

    const res = await callNow({
      targetPhone,
      targetName: slots.restaurantName ?? null,
      partySize: slots.partySize ?? null,
      date: slots.date ?? null,
      time: slots.time ?? null,
      notes: slots.notes ?? null,
      source: 'app',
    });

    if (!res.ok) {
      console.warn('[callNow] failed', res);
      return Alert.alert('Call failed', `${res.error}${res.status ? ` (${res.status})` : ''}`);
    }
    Alert.alert('Calling…', `Call ID: ${res.callId ?? '—'}`);
  }, [slots]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 12 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
          {messages.map((m) => (
            <View key={m.id} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '600' }}>{m.role === 'user' ? 'You' : 'Jason'}</Text>
              <Text>{m.content}</Text>
            </View>
          ))}

          <View style={{ marginTop: 16, padding: 10, borderWidth: 1, borderColor: '#eee', borderRadius: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Slots</Text>
            <Text>Restaurant: {slots.restaurantName || '—'}</Text>
            <Text>Phone: {slots.targetPhone || slots.restaurantPhone || '—'}</Text>
            <Text>Date: {slots.date || '—'}</Text>
            <Text>Time: {slots.time || '—'}</Text>
            <Text>Party Size: {slots.partySize ?? '—'}</Text>
            {slots.notes ? <Text>Notes: {slots.notes}</Text> : null}
            <View style={{ marginTop: 8 }}>
              <Button title="Call now" onPress={handleCallNow} />
            </View>
          </View>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Jason to book…"
            style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 }}
            editable={!busy}
          />
          <Button title={busy ? '…' : 'Send'} onPress={handleSend} disabled={busy} />
          {busy ? <ActivityIndicator style={{ marginLeft: 8 }} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
