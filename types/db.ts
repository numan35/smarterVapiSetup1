// types/db.ts
export type CallRow = {
  id: string;
  status: string;
  target_name: string | null;
  target_phone: string;
  notes?: string | null;
  vapi_call_id?: string | null;
  created_at: string;
};
