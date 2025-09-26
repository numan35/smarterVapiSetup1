// lib/configGuard.ts — dev-time guard to catch missing config early
import Constants from "expo-constants";

export function assertConfig() {
  const ex: any = Constants.expoConfig?.extra ?? {};
  const errs: string[] = [];
  if (!ex.supabaseUrl) errs.push("extra.supabaseUrl missing");
  if (!ex.supabaseAnonKey) errs.push("extra.supabaseAnonKey missing");
  if (!ex.supabaseFunctionsBase) errs.push("extra.supabaseFunctionsBase missing");
  if (errs.length) {
    const msg = `Config error:\n- ${errs.join("\n- ")}`;
    console.error(msg);
    if (__DEV__) throw new Error(msg);
  }
}
