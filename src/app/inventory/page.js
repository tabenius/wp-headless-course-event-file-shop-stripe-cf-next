import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCourseAccessState } from "@/lib/courseAccess";
import { listAccessibleDigitalProductIds } from "@/lib/digitalAccessStore";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { appendServerLog } from "@/lib/serverLog";
import {
  resolveProductHref,
  resolveProductAction,
  resolveProductTypeLabel,
} from "@/lib/productRoutes";

export const dynamic = "force-dynamic";

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeUri(uri) {
  const value = String(uri || "").trim();
  if (!value) return "";
  if (value === "/") return "/";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.replace(/\/+$/, "") || "/";
}

function buildFallbackItem(productId) {
  return {
    key: `missing:${productId}`,
    name: `Product ${productId}`,
    description: "This purchase exists but the product record is no longer available.",
    label: "Unavailable",
    href: "",
    action: "",
  };
}

export const metadata = {
  title: "Inventory",
  alternates: { canonical: "/inventory" },
};

export default async function InventoryPage() {
  const session = await auth();
  const userEmail = session?.user?.email || "";
  if (!userEmail) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/inventory")}`);
  }

  const safeEmail = normalizeEmail(userEmail);

  const [ownedProductIds, digitalProducts, courseAccessState] =
    await Promise.all([
      listAccessibleDigitalProductIds(safeEmail).catch((err) => {
        appendServerLog({ level: "error", msg: `inventory: digitalAccess failed for ${safeEmail}: ${err?.message}` }).catch(() => {});
        return [];
      }),
      listDigitalProducts({ includeInactive: true }).catch((err) => {
        appendServerLog({ level: "error", msg: `inventory: listDigitalProducts failed: ${err?.message}` }).catch(() => {});
        return [];
      }),
      getCourseAccessState().catch((err) => {
        appendServerLog({ level: "error", msg: `inventory: courseAccess failed: ${err?.message}` }).catch(() => {});
        return { courses: {} };
      }),
    ]);

  // Map productId → product
  const digitalById = new Map(digitalProducts.map((p) => [p.id, p]));

  // Purchased digital products
  const purchasedItems = ownedProductIds.map((productId) => {
    const product = digitalById.get(productId);
    if (!product) return buildFallbackItem(productId);
    return {
      key: `digital:${product.id}`,
      name: product.name || product.id,
      description: product.description || "",
      label: resolveProductTypeLabel(product),
      href: resolveProductHref(product),
      action: resolveProductAction(product),
    };
  });

  // Map contentUri → product for enriching WP course-access grants
  const productByContentUri = new Map();
  for (const p of digitalProducts) {
    if (p.productMode === "manual_uri" && p.contentUri) {
      productByContentUri.set(normalizeUri(p.contentUri), p);
    }
  }

  // Admin-granted WordPress content access
  const grantedItems = [];
  const courses = courseAccessState?.courses || {};
  for (const [rawUri, config] of Object.entries(courses)) {
    const uri = normalizeUri(rawUri);
    if (!uri) continue;
    // Guard: skip corrupted entries where a raw external URL is stored as a URI key
    if (uri.startsWith("/http://") || uri.startsWith("/https://")) continue;
    const allowedUsers = Array.isArray(config?.allowedUsers) ? config.allowedUsers : [];
    if (!allowedUsers.some((e) => normalizeEmail(e) === safeEmail)) continue;
    const product = productByContentUri.get(uri);
    grantedItems.push({
      key: `granted:${uri}`,
      name: product?.name || uri,
      description: product?.description || "You have been granted access to this content.",
      label: product ? resolveProductTypeLabel(product) : "Granted access",
      href: uri,
      action: "Open content",
    });
  }

  const inventoryItems = [...purchasedItems, ...grantedItems].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 space-y-6">
      <p>
        <Link href="/shop" className="text-sm text-teal-800 hover:underline">
          Back to shop
        </Link>
      </p>
      <div>
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-gray-600 mt-2">All products and content you have access to.</p>
      </div>
      {inventoryItems.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <p className="text-gray-700">No purchased products found yet.</p>
          <Link href="/shop" className="text-teal-800 hover:underline">
            Open shop
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {inventoryItems.map((item) => (
            <article key={item.key} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold break-words">{item.name}</h2>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-800 whitespace-nowrap">
                  {item.label}
                </span>
              </div>
              {item.description ? (
                <p className="text-sm text-gray-700">{item.description}</p>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-block px-4 py-2 rounded bg-teal-700 text-white text-sm hover:bg-teal-600"
                >
                  {item.action}
                </Link>
              ) : (
                <p className="text-xs text-gray-500">No action available.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
