export type ReservationForm = {
  restaurantName?: string;
  city?: string;             // required if using name (no phone)
  targetPhone?: string;      // E.164 (+12125551234) alternative to name+city
  partySize?: number;        // 1–20
  date?: string;             // YYYY-MM-DD
  time?: string;             // HH:mm (24h)
  userPhone?: string;        // E.164 (+1…)
  consent?: boolean;         // user agrees to place the call
};

const E164 = /^\+?[1-9]\d{6,14}$/;
const HHMM = /^\d{2}:\d{2}$/;

export function validateReservation(f: ReservationForm) {
  const missing: string[] = [];

  const hasPhone = !!f.targetPhone && E164.test(f.targetPhone);
  const hasNameAndCity = !!f.restaurantName && !!f.city;

  if (!(hasPhone || hasNameAndCity)) {
    missing.push("restaurant name + city OR restaurant phone");
  }
  if (!Number.isInteger(f.partySize) || (f.partySize ?? 0) < 1) missing.push("party size");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date ?? "")) missing.push("date (YYYY-MM-DD)");
  if (!HHMM.test(f.time ?? "")) missing.push("time (HH:mm)");

  if (!f.userPhone || !E164.test(f.userPhone)) missing.push("your phone (+E.164)");
  if (!f.consent) missing.push("consent to call");

  return { ok: missing.length === 0, missing };
}
