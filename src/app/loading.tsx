export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10" aria-live="polite" aria-busy="true">
      <div className="animate-pulse space-y-4">
        <div className="h-40 rounded-xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-24 rounded-lg bg-slate-200" />
          <div className="h-24 rounded-lg bg-slate-200" />
          <div className="h-24 rounded-lg bg-slate-200" />
        </div>
        <div className="h-64 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
