// app.config.ts — replaces app.json; single source of truth for client config
import { ConfigContext } from "expo/config";

export default ({ config }: ConfigContext) => ({
  ...config,
  name: "Jason",
  slug: "jason",
  scheme: "jason",
  extra: {
    // ✅ Single source of truth
    supabaseUrl: "https://lkoogdveljyxwweranaf.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb29nZHZlbGp5eHd3ZXJhbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NjQ1MDEsImV4cCI6MjA3MjU0MDUwMX0.gER6-spRheuIzCe_ET-ntaklbRQHkmGb75I3UJkFYKs",
    supabaseFunctionsBase: "https://lkoogdveljyxwweranaf.functions.supabase.co",

    // Optional local dev helper for call-now (only if CALL_NOW_TEST_TOKEN is set server-side)
    devToken: "something-unguessable-123"
  }
});
