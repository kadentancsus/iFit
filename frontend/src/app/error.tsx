"use client";

export default function RouteError({ retry }: { error: Error; retry: () => void }) {
  return (
    <section role="alert" aria-labelledby="error-title" className="flex flex-col items-start gap-4">
      <h1 id="error-title" className="text-2xl font-bold">
        Something went wrong
      </h1>
      <p className="text-muted">
        We couldn&apos;t load this page. Check your connection and try again. Nothing you already
        saved has been lost.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-brand-contrast hover:bg-brand-strong"
      >
        Try again
      </button>
    </section>
  );
}
