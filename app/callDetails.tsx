import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function CallDetails() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>Call Details</Text>
      <Text style={{ marginTop: 8 }}>id: {id ?? '(none provided)'}</Text>
      <Text style={{ marginTop: 8, textAlign: 'center' }}>
        This is a placeholder. Wire it to your Supabase `calls` table when ready.
      </Text>
    </View>
  );
}
