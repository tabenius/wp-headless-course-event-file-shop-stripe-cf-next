import { t } from "@/lib/i18n";

export default function AdminLoadingShell() {
  return (
    <main className="p-4 md:p-6" aria-busy="true" aria-live="polite">
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          {t("common.loading", "Loading…")}
        </p>
      </section>
    </main>
  );
}
