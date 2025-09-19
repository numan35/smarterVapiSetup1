// lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as any;

export const supabase = createClient(
  extra.supabaseUrl,
  extra.supabaseAnonKey,
  {
    auth: {
      persistSession: false, // tweak if you add auth later
      autoRefreshToken: false,
    },
  }
);
