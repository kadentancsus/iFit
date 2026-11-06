export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}
