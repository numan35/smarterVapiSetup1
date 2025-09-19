// services/callNow.ts
import Constants from 'expo-constants';

// request body (shared with Edge Function)
export type CallNowBody = {
  targetName?: string | null;
  targetPhone: string; // E.164 (+14045551234)
  notes?: string | null;
  source?: 'app' | 'admin' | string;
};

// response shape
export type CallNowResponse =
  | { ok: true; callId: string | null }
  | { ok: false; error: string };

export async function callNow(args: CallNowBody): Promise<CallNowResponse> {
  const extra = Constants.expoConfig?.extra as any;

  const base =
    extra?.supabaseFunctionsBase ??
    `https://${extra?.supabaseUrl
      ?.replace(/^https?:\/\//, '')
      ?.split('.supabase.co')[0]}.functions.supabase.co`;

  const url = `${base}/call-now`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra?.supabaseAnonKey
      ? {
          Authorization: `Bearer ${extra.supabaseAnonKey}`,
          apikey: extra.supabaseAnonKey,
        }
      : {}),
    ...(extra?.devToken ? { 'x-dev-token': extra.devToken } : {}),
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetName: args.targetName ?? null,
        targetPhone: args.targetPhone,
        notes: args.notes ?? null,
        source: args.source ?? 'app',
      }),
    });

    const json = await r.json().catch(() => ({}));

    if (!r.ok) {
      return {
        ok: false,
        error: json?.error ?? `HTTP ${r.status}`,
      };
    }

    return {
      ok: true,
      callId: json?.callId ?? json?.call?.id ?? null,
    };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'Network error' };
  }
}
