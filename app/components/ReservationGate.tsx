import React, { useState } from "react";
import { validateReservation, type ReservationForm } from "@/lib/validateReservation";

export default function ReservationGate({ initial, onReady }: {
  initial?: Partial<ReservationForm>;
  onReady: (form: ReservationForm) => void;
}) {
  const [form, setForm] = useState<ReservationForm>({ partySize: 2, ...initial });
  const [errors, setErrors] = useState<string[]>([]);

  function update<K extends keyof ReservationForm>(k: K, v: ReservationForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function tryProceed() {
    const { ok, missing } = validateReservation(form);
    if (!ok) { setErrors(missing); return; }
    setErrors([]);
    onReady(form);
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="text-lg font-semibold">Reservation details</div>

      <div className="grid grid-cols-2 gap-3">
        <input className="border p-2 rounded-xl" placeholder="Restaurant name"
          value={form.restaurantName ?? ""} onChange={e => update("restaurantName", e.target.value)} />
        <input className="border p-2 rounded-xl" placeholder="City (e.g., New York)"
          value={form.city ?? ""} onChange={e => update("city", e.target.value)} />

        <input className="border p-2 rounded-xl" placeholder="Restaurant phone (+12125551234)"
          value={form.targetPhone ?? ""} onChange={e => update("targetPhone", e.target.value)} />

        <input type="number" min={1} max={20} className="border p-2 rounded-xl" placeholder="Party size"
          value={form.partySize ?? 2} onChange={e => update("partySize", parseInt(e.target.value || "0", 10))} />

        <input className="border p-2 rounded-xl" placeholder="Date (YYYY-MM-DD)"
          value={form.date ?? ""} onChange={e => update("date", e.target.value)} />

        <input className="border p-2 rounded-xl" placeholder="Time (HH:mm, 24h)"
          value={form.time ?? ""} onChange={e => update("time", e.target.value)} />

        <input className="border p-2 rounded-xl col-span-2" placeholder="Your phone (+1...)"
          value={form.userPhone ?? ""} onChange={e => update("userPhone", e.target.value)} />
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!!form.consent}
               onChange={e => update("consent", e.target.checked)} />
        <span>I consent to place this call on my behalf.</span>
      </label>

      {errors.length > 0 && (
        <div className="text-sm text-red-600">Missing / invalid: {errors.join(", ")}</div>
      )}

      <div className="flex justify-end">
        <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={tryProceed}>
          Continue
        </button>
      </div>
    </div>
  );
}
