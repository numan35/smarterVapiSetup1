// lib/vapi.ts
import Constants from 'expo-constants';

export async function vapiStartCall(params: { to: string; prompt?: string; assistantId?: string }) {
  const extra = Constants.expoConfig?.extra as any;
  const base = extra?.vapiBase;
  const key  = extra?.vapiApiKey;
  const asst = params.assistantId ?? extra?.vapiAssistantId;

  const r = await fetch(`${base}/call`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ assistantId: asst, phoneNumber: params.to, metadata: { prompt: params.prompt ?? '' } })
  });
  if (!r.ok) throw new Error(`Vapi ${r.status}`);
  return r.json();
}
