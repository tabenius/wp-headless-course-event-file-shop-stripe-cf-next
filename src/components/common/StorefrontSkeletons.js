function SkeletonBlock({ className = "" }) {
  return (
    <div aria-hidden="true" className={`storefront-skeleton ${className}`} />
  );
}

export function StorefrontArticleSkeleton({ paragraphs = 8 }) {
  return (
    <article
      className="max-w-2xl px-6 py-24 mx-auto space-y-8"
      aria-busy="true"
    >
      <header className="space-y-4">
        <SkeletonBlock className="h-4 w-40 rounded-full" />
        <SkeletonBlock className="h-12 w-3/4 rounded-lg" />
      </header>
      <SkeletonBlock className="h-72 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: paragraphs }).map((_, index) => (
          <SkeletonBlock
            key={`article-line-${index}`}
            className={`h-4 rounded ${
              index % 4 === 3 ? "w-3/5" : index % 5 === 4 ? "w-4/5" : "w-full"
            }`}
          />
        ))}
      </div>
    </article>
  );
}

export function StorefrontListSkeleton({
  items = 5,
  withImage = true,
  containerClassName = "max-w-4xl mx-auto px-6 py-24",
}) {
  return (
    <main className={containerClassName} aria-busy="true">
      <div className="mb-10 space-y-3">
        <SkeletonBlock className="h-12 w-72 rounded-lg" />
        <SkeletonBlock className="h-4 w-56 rounded-full" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: items }).map((_, index) => (
          <section
            key={`list-item-${index}`}
            className="border rounded-lg p-4 sm:p-5 space-y-3"
          >
            {withImage && <SkeletonBlock className="h-40 w-full rounded-lg" />}
            <SkeletonBlock className="h-7 w-2/3 rounded-md" />
            <SkeletonBlock className="h-4 w-full rounded" />
            <SkeletonBlock className="h-4 w-5/6 rounded" />
          </section>
        ))}
      </div>
    </main>
  );
}

export function StorefrontGridSkeleton({
  items = 6,
  containerClassName = "max-w-5xl mx-auto px-6 py-24",
}) {
  return (
    <main className={containerClassName} aria-busy="true">
      <div className="mb-10 space-y-3">
        <SkeletonBlock className="h-12 w-72 rounded-lg" />
        <SkeletonBlock className="h-4 w-56 rounded-full" />
      </div>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: items }).map((_, index) => (
          <section
            key={`grid-item-${index}`}
            className="border rounded-lg p-4 space-y-3"
          >
            <SkeletonBlock className="h-44 w-full rounded-lg" />
            <SkeletonBlock className="h-7 w-3/4 rounded-md" />
            <SkeletonBlock className="h-4 w-full rounded" />
            <SkeletonBlock className="h-4 w-4/5 rounded" />
          </section>
        ))}
      </div>
    </main>
  );
}

export function StorefrontDetailSkeleton() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-24 space-y-8" aria-busy="true">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <SkeletonBlock className="h-12 w-3/4 rounded-lg" />
          <SkeletonBlock className="h-72 w-full rounded-xl" />
          <SkeletonBlock className="h-4 w-full rounded" />
          <SkeletonBlock className="h-4 w-5/6 rounded" />
          <SkeletonBlock className="h-4 w-2/3 rounded" />
        </section>
        <aside className="border rounded-xl p-5 space-y-4">
          <SkeletonBlock className="h-8 w-40 rounded-md" />
          <SkeletonBlock className="h-10 w-32 rounded-md" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-4 w-4/5 rounded" />
        </aside>
      </div>
    </main>
  );
}

export function StorefrontHomeSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <section className="max-w-5xl mx-auto px-6 pt-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`home-event-${index}`}
              className="border rounded-lg p-3 space-y-2"
            >
              <SkeletonBlock className="h-20 w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-4/5 rounded" />
              <SkeletonBlock className="h-4 w-3/5 rounded" />
            </div>
          ))}
        </div>
      </section>
      <StorefrontArticleSkeleton paragraphs={9} />
    </div>
  );
}
