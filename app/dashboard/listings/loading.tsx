export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8" aria-busy="true">
      <div className="mb-8 h-12 w-64 animate-pulse rounded-xl bg-slate-200" />
      <div className="space-y-4">
        {[0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-[28px] bg-slate-100" />)}
      </div>
    </main>
  );
}
