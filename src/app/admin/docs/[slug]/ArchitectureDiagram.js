"use client";

const boxBase =
  "rounded-lg border-2 px-4 py-3 text-center text-sm font-semibold shadow-sm min-w-[140px]";

const styles = {
  client: `${boxBase} bg-blue-50 border-blue-400 text-blue-900`,
  worker: `${boxBase} bg-amber-50 border-amber-400 text-amber-900`,
  wp: `${boxBase} bg-green-50 border-green-400 text-green-900`,
  stripe: `${boxBase} bg-purple-50 border-purple-400 text-purple-900`,
  storage: `${boxBase} bg-rose-50 border-rose-400 text-rose-900`,
  oauth: `${boxBase} bg-cyan-50 border-cyan-400 text-cyan-900`,
};

function Arrow({ label, dashed }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-[11px] text-gray-500 font-medium">
      {label && <span>{label}</span>}
      <div
        className={`w-px h-6 ${dashed ? "border-l-2 border-dashed border-gray-300" : "bg-gray-400"}`}
      />
      <span className="text-gray-400">&#9660;</span>
    </div>
  );
}

function HArrow({ label, reverse }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium whitespace-nowrap px-1">
      {reverse && <span className="text-gray-400">&#9664;</span>}
      {!reverse && <span className="text-gray-400">&#9654;</span>}
      {label && <span>{label}</span>}
      {reverse && <span className="text-gray-400">&#9654;</span>}
      {!reverse && <span className="text-gray-400">&#9664;</span>}
    </div>
  );
}

function BiArrow({ label }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-[11px] text-gray-500 font-medium">
      <span className="text-gray-400">&#9650;</span>
      <div className="w-px h-4 bg-gray-400" />
      {label && <span>{label}</span>}
      <div className="w-px h-4 bg-gray-400" />
      <span className="text-gray-400">&#9660;</span>
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <div className="space-y-10">
      {/* ---- Main flow ---- */}
      <div className="flex flex-col items-center">
        <div className={styles.client}>
          Browser / Client
          <div className="text-[11px] font-normal mt-1 text-gray-600">
            React (CSR) + Server Components (SSR)
          </div>
        </div>

        <BiArrow label="HTTPS requests / HTML + JSON responses" />

        <div className={styles.worker}>
          Cloudflare Workers
          <div className="text-[11px] font-normal mt-1 text-gray-600">
            Next.js 15 App Router (via OpenNext)
          </div>
        </div>

        {/* Branches from Workers */}
        <div className="w-px h-6 bg-gray-400" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {/* WordPress */}
          <div className="flex flex-col items-center">
            <Arrow label="GraphQL queries" />
            <div className={styles.wp}>
              WordPress
              <div className="text-[11px] font-normal mt-1 text-gray-600">
                WPGraphQL + LearnPress
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center space-y-0.5">
              <p>Pages, posts, courses</p>
              <p>Media library uploads</p>
              <p>Course price &amp; duration</p>
            </div>
          </div>

          {/* Stripe */}
          <div className="flex flex-col items-center">
            <Arrow label="Checkout API" />
            <div className={styles.stripe}>
              Stripe
              <div className="text-[11px] font-normal mt-1 text-gray-600">
                Payments &amp; Webhooks
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center space-y-0.5">
              <p>Checkout sessions</p>
              <p>
                Webhook &rarr; <code className="bg-gray-100 px-1 rounded">checkout.session.completed</code>
              </p>
              <p>Grants course/digital access</p>
            </div>
          </div>

          {/* Storage */}
          <div className="flex flex-col items-center">
            <Arrow label="KV read/write" />
            <div className={styles.storage}>
              Cloudflare KV
              <div className="text-[11px] font-normal mt-1 text-gray-600">
                Persistent key-value store
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center space-y-0.5">
              <p>Course access lists</p>
              <p>Digital product grants</p>
              <p>User accounts</p>
              <p className="text-gray-400 italic">Fallback: local .data/ files</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Auth flow ---- */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Authentication flow</h3>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className={styles.client}>Browser</div>
          <HArrow label="cookie" />
          <div className={styles.worker}>
            Workers
            <div className="text-[11px] font-normal mt-1 text-gray-600">
              HMAC-signed session cookies
            </div>
          </div>
          <HArrow label="OAuth 2.0" />
          <div className={styles.oauth}>
            OAuth Providers
            <div className="text-[11px] font-normal mt-1 text-gray-600">
              Google, Apple, Microsoft, Facebook
            </div>
          </div>
        </div>
      </div>

      {/* ---- Payment flow ---- */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment flow</h3>
        <div className="overflow-x-auto">
          <ol className="list-decimal list-inside text-sm space-y-2 text-gray-700">
            <li>
              User visits a course page &rarr; <strong>Workers</strong> fetches
              content from <strong>WordPress GraphQL</strong> and access status
              from <strong>Cloudflare KV</strong>.
            </li>
            <li>
              User clicks <em>Buy now</em> &rarr; redirected to sign-in /
              register if not authenticated.
            </li>
            <li>
              Authenticated user clicks <em>Pay and unlock</em> &rarr;{" "}
              <strong>Workers</strong> creates a Stripe Checkout session and
              redirects to <strong>Stripe</strong>.
            </li>
            <li>
              After payment, Stripe sends a{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                checkout.session.completed
              </code>{" "}
              webhook to <strong>Workers</strong>.
            </li>
            <li>
              Workers verifies the webhook signature, then writes access grants
              to <strong>Cloudflare KV</strong>.
            </li>
            <li>
              User is redirected back to the course page and can now view the
              full content.
            </li>
          </ol>
        </div>
      </div>

      {/* ---- Upload flow ---- */}
      <div>
        <h3 className="text-lg font-semibold mb-4">File upload backends</h3>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className={styles.worker}>
            Workers
            <div className="text-[11px] font-normal mt-1 text-gray-600">
              /api/admin/upload
            </div>
          </div>
          <HArrow label="" />
          <div className="flex flex-col gap-2">
            <div className={styles.wp}>WordPress Media Library</div>
            <div className={styles.storage}>Cloudflare R2 / S3</div>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 text-center mt-2">
          Configurable via <code className="bg-gray-100 px-1 rounded">UPLOAD_BACKEND</code> (wordpress | r2 | s3)
        </p>
      </div>
    </div>
  );
}
