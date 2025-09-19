import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, FlatList, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import type { CallRow } from '@/types/db';

export default function Recent() {
  const router = useRouter();
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('calls')
        .select('id,status,target_name,target_phone,created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setRows((data ?? []) as CallRow[]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Recent Calls</Text>
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/call/${item.id}`)}
            style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
          >
            <Text style={{ fontWeight: '600' }}>{item.target_name ?? item.target_phone}</Text>
            <Text>Status: {item.status}</Text>
            <Text>{new Date(item.created_at).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
