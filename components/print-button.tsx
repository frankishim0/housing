'use client';

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 print:hidden">Print / Save PDF</button>;
}
