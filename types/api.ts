// types/api.ts
export type CallNowBody = {
  targetName?: string | null;
  targetPhone: string; // must be in E.164 format (+14045551234)
  notes?: string | null;
  source?: 'app' | 'admin' | string;
};
