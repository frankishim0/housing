export default function LoadingEditListing() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8" aria-busy="true">
      <div className="mb-8 h-12 w-64 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-[50rem] animate-pulse rounded-[28px] bg-slate-100" />
    </main>
  );
}
