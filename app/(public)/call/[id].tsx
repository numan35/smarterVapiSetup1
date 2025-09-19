import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Button, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { CallRow } from '@/types/db';

export default function CallDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [call, setCall] = useState<CallRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCall = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('calls').select('*').eq('id', id).single();
      if (error) throw error;
      setCall(data as CallRow);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load call');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCall();
    const t = setInterval(fetchCall, 3000);
    return () => clearInterval(t);
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;

  if (!call) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Call not found.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Call Details</Text>
      <Text>ID: {call.id}</Text>
      <Text>Status: {call.status}</Text>
      <Text>Business: {call.target_name ?? '—'}</Text>
      <Text>Phone: {call.target_phone}</Text>
      <Text>Notes: {call.notes ?? '—'}</Text>
      <Text>Vapi ID: {call.vapi_call_id ?? '—'}</Text>
      <Text>Created: {new Date(call.created_at).toLocaleString()}</Text>

      <View style={{ height: 12 }} />
      <Button title="Back" onPress={() => router.back()} />
    </View>
  );
}
