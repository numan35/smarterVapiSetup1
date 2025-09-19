// app/services/callNow.ts
// app/services/callNow.ts
export type CallNowInput = {
  targetName: string;
  targetPhone: string;   // E.164
  notes?: string;        // audit trail
  script?: string;       // MUST be first utterance/instructions
  source?: "jason" | "app";
  devToken?: string;
};

export async function callNow(input: CallNowInput) {
  try {
    const resp = await fetch(

      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/call-now`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
          ...(input.devToken ? { "x-dev-token": input.devToken } : {}),
        },
        body: JSON.stringify(input),
      }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: data?.error || "call_failed" };
    }
    return { ok: true, ...data };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
