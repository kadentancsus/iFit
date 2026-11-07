export default function HomePage() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-4">
      <h1 id="home-title" className="text-3xl font-bold tracking-tight">
        Making every workout count
      </h1>
      <p className="text-base text-muted">
        Log sets in a tap, swap equipment that&apos;s taken, and check your form without losing
        your place.
      </p>
    </section>
  );
}
