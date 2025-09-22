// lib/jasonBrain.ts — DEBUG/INSPECTABLE version
// Drop-in replacement for your existing brain client with rich logging
// - Logs URL, headers presence, status, and a preview of the response body
// - Derives functions base from `extra.supabaseFunctionsBase` or `extra.supabaseUrl`
// - Always returns a consistent shape so the UI won’t stall on odd server replies

import Constants from 'expo-constants';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type BrainPayload = {
  messages: ChatMessage[];
  // Optional extras you might already send
  slots?: Record<string, any> | null;
  session?: Record<string, any> | null;
  meta?: Record<string, any> | null;
};

export type BrainAnnotation = {
  type: string;
  key?: string;
  value?: any;
  [k: string]: any;
};

export type BrainResponse = {
  ok: boolean;
  status?: number;
  error?: string;
  message?: { role: 'assistant'; content: string; annotations?: BrainAnnotation[] } | null;
  annotations?: BrainAnnotation[];
  toolRequests?: any[];
  raw?: any; // raw parsed JSON in case you want to inspect
};

function getEnv() {
  const extra = (Constants.expoConfig?.extra ?? {}) as any;
  const explicit = extra?.supabaseFunctionsBase as string | undefined;
  const supabaseUrl = String(extra?.supabaseUrl || '').trim();
  const derived = supabaseUrl
    ? `https://${supabaseUrl.replace(/^https?:\/\//, '').split('.supabase.co')[0]}.functions.supabase.co`
    : undefined;
  const base = explicit || derived;
  const anon = String(extra?.supabaseAnonKey || '').trim();
  const devToken = extra?.devToken != null ? String(extra.devToken) : undefined;
  return { base, anon, devToken, extra };
}

function makeHeaders(anon?: string, devToken?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (anon) {
    h.Authorization = `Bearer ${anon}`;
    h.apikey = anon;
  }
  if (devToken) h['x-dev-token'] = devToken;
  return h;
}

function preview(obj: any, limit = 500): string {
  try {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return s.length > limit ? s.slice(0, limit) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return new Promise((resolve, reject) => {
    p.then(resolve).catch(reject).finally(() => clearTimeout(id));
  });
}

export async function callJasonBrain(payload: BrainPayload): Promise<BrainResponse> {
  const { base, anon, devToken, extra } = getEnv();

  if (!base) {
    console.error('[jasonBrain] Missing functions base. Provide extra.supabaseFunctionsBase or supabaseUrl in app.json');
    return { ok: false, error: 'Missing Supabase functions base URL' };
  }

  const url = `${base.replace(/\/$/, '')}/jason-brain`;
  const headers = makeHeaders(anon, devToken);

  // —— LOG the outgoing request ——
  console.log('[jasonBrain] POST', url, {
    hasAuth: Boolean(headers.Authorization),
    hasApiKey: Boolean((headers as any).apikey),
    hasDevToken: Boolean((headers as any)['x-dev-token']),
    envKeys: Object.keys(extra || {}),
  });

  let res: Response | null = null;
  let text = '';
  try {
    res = await withTimeout(fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }), 60000);
    text = await res.text();
  } catch (e: any) {
    console.error('[jasonBrain] network error:', e?.message || e);
    return { ok: false, error: e?.message || 'Network error' };
  }

  // —— LOG the response status + body preview ——
  console.log('[jasonBrain] status', res.status, 'body:', preview(text));

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const errMsg = json?.error || (res.statusText || `HTTP ${res.status}`);
    return { ok: false, status: res.status, error: errMsg, raw: json };
  }

  // Normalize to a consistent shape the UI expects
  const assistant = json?.message && typeof json.message === 'object'
    ? json.message
    : (json?.assistant || null);

  const anns: BrainAnnotation[] = Array.isArray(json?.annotations) ? json.annotations : [];
  const inlineAnns: BrainAnnotation[] = Array.isArray(assistant?.annotations) ? assistant.annotations : [];

  // —— LOG the annotation counts ——
  console.log('[jasonBrain] annotations inline=%d top=%d', inlineAnns.length, anns.length);

  const message = assistant && typeof assistant.content === 'string'
    ? { role: 'assistant' as const, content: assistant.content, annotations: inlineAnns }
    : (anns.length ? { role: 'assistant' as const, content: 'Got it — updated the details.', annotations: inlineAnns } : null);

  return {
    ok: Boolean(json?.ok ?? true),
    status: res.status,
    message,
    annotations: anns,
    toolRequests: Array.isArray(json?.toolRequests) ? json.toolRequests : [],
    raw: json,
  };
}

export default callJasonBrain;
