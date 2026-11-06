import Link from "next/link";

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-title" className="flex flex-col items-start gap-4">
      <h1 id="not-found-title" className="text-2xl font-bold">
        Page not found
      </h1>
      <p className="text-muted">
        This page doesn&apos;t exist, or it belongs to a different account.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-brand-contrast hover:bg-brand-strong"
      >
        Back to home
      </Link>
    </section>
  );
}
