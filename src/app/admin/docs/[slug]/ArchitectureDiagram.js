"use client";

import { tenantConfig } from "@/lib/tenantConfig";

const boxBase =
  "rounded-lg border-2 px-4 py-3 text-center text-sm font-semibold shadow-sm min-w-[140px]";

const styles = {
  client: `${boxBase} bg-blue-50 border-blue-400 text-blue-900`,
  worker: `${boxBase} bg-amber-50 border-amber-400 text-amber-900`,
  wp: `${boxBase} bg-green-50 border-green-400 text-green-900`,
  stripe: `${boxBase} bg-purple-50 border-purple-400 text-purple-900`,
  storage: `${boxBase} bg-rose-50 border-rose-400 text-rose-900`,
  oauth: `${boxBase} bg-cyan-50 border-cyan-400 text-cyan-900`,
  email: `${boxBase} bg-teal-50 border-teal-400 text-teal-900`,
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

function ContentBlock({ title, items }) {
  return (
    <div className="border rounded px-3 py-2 text-[11px] text-gray-600 space-y-0.5">
      <div className="font-semibold text-gray-800 text-xs">{title}</div>
      {items.map((item, i) => (
        <p key={i}>{item}</p>
      ))}
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full max-w-5xl">
          {/* WordPress */}
          <div className="flex flex-col items-center">
            <Arrow label="GraphQL queries" />
            <div className={styles.wp}>
              WordPress
              <div className="text-[11px] font-normal mt-1 text-gray-600">
                WPGraphQL + WooCommerce + LearnPress
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center space-y-0.5">
              <p>Pages, posts, menus</p>
              <p>WooCommerce products</p>
              <p>LearnPress courses</p>
              <p>Events</p>
              <p>Media library</p>
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
                Webhook &rarr;{" "}
                <code className="bg-gray-100 px-1 rounded">
                  checkout.session.completed
                </code>
              </p>
              <p>Grants access + sends receipt</p>
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
              <p>Content access lists</p>
              <p>Digital product grants</p>
              <p>User accounts</p>
              <p className="text-gray-400 italic">
                Fallback: local .data/ files
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col items-center">
            <Arrow label="Transactional email" />
            <div className={styles.email}>
              Resend
              <div className="text-[11px] font-normal mt-1 text-gray-600">
                Email delivery API
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center space-y-0.5">
              <p>Purchase receipts</p>
              <p>Password reset</p>
              <p>BCC to {tenantConfig.supportEmail}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Content types ---- */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Content types &amp; sources
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ContentBlock
            title="WooCommerce Products"
            items={[
              "Source: WordPress GraphQL",
              "URI: /produkt/{slug}/",
              "Fields: name, price, description",
              "Paywall: Stripe checkout",
              "Access: Cloudflare KV",
            ]}
          />
          <ContentBlock
            title="LearnPress Courses"
            items={[
              "Source: WordPress GraphQL",
              "URI: /courses/{slug}/",
              "Fields: title, price, duration",
              "Paywall: Stripe checkout",
              "Access: Cloudflare KV",
            ]}
          />
          <ContentBlock
            title="Events"
            items={[
              "Source: WordPress GraphQL",
              "URI: /events/event/{slug}/",
              "Fields: title, venue, date",
              "Paywall: Stripe checkout",
              "Access: Cloudflare KV",
            ]}
          />
          <ContentBlock
            title="Digital Products (Shop)"
            items={[
              "Source: Cloudflare KV (seeded from config/digital-products.json)",
              "URI: /shop/{slug}",
              "Fields: name, price, file/course",
              "Paywall: Stripe checkout",
              "Access: Cloudflare KV",
            ]}
          />
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
        <h3 className="text-lg font-semibold mb-4">
          Payment flow (all content types)
        </h3>
        <div className="overflow-x-auto">
          <ol className="list-decimal list-inside text-sm space-y-2 text-gray-700">
            <li>
              User visits a content page (product, course, or event) &rarr;{" "}
              <strong>Workers</strong> fetches content from{" "}
              <strong>WordPress GraphQL</strong> and access status from{" "}
              <strong>Cloudflare KV</strong>.
            </li>
            <li>
              If no access, a <strong>Paywall</strong> is shown with price and
              description. Unauthenticated users are redirected to sign-in.
            </li>
            <li>
              Authenticated user clicks <em>Pay and unlock</em> &rarr;{" "}
              <strong>Workers</strong> creates a Stripe Checkout session (price
              from admin config) and redirects to <strong>Stripe</strong>.
            </li>
            <li>
              After payment, Stripe sends a{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                checkout.session.completed
              </code>{" "}
              webhook to <strong>Workers</strong>.
            </li>
            <li>
              Workers verifies the webhook signature, writes access grants to{" "}
              <strong>Cloudflare KV</strong>, and sends a purchase receipt via{" "}
              <strong>Resend</strong> (with BCC to {tenantConfig.supportEmail}).
            </li>
            <li>
              User is redirected back to the content page and can now view the
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
          Configurable via{" "}
          <code className="bg-gray-100 px-1 rounded">UPLOAD_BACKEND</code>{" "}
          (wordpress | r2 | s3)
        </p>
      </div>
    </div>
  );
}
