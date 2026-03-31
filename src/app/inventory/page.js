import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCourseAccessState } from "@/lib/courseAccess";
import { listAccessibleDigitalProductIds } from "@/lib/digitalAccessStore";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { listAllShopItems } from "@/lib/shopProducts";
import { appendServerLog } from "@/lib/serverLog";

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

function inferMode(product) {
  const mode = typeof product?.productMode === "string" ? product.productMode : "";
  if (mode === "asset" || mode === "manual_uri" || mode === "digital_file") {
    return mode;
  }
  return product?.type === "course" ? "manual_uri" : "digital_file";
}

function digitalTypeLabel(product) {
  const mode = inferMode(product);
  if (mode === "asset") return "Asset product";
  if (mode === "manual_uri") return "Protected content";
  return "Digital file";
}

function shopTypeLabel(type) {
  switch (type) {
    case "course":
      return "Course";
    case "event":
      return "Event";
    case "product":
      return "Product";
    default:
      return "Protected content";
  }
}

function buildDigitalOwnedItem(product) {
  const mode = inferMode(product);
  if (mode === "asset") {
    return {
      key: `digital:${product.id}`,
      name: product.name || product.id,
      description: product.description || "",
      label: digitalTypeLabel(product),
      href: `/digital/${encodeURIComponent(product.slug || product.id)}`,
      action: "Download",
      isDownload: false,
    };
  }
  if (mode === "manual_uri" && product.courseUri) {
    return {
      key: `digital:${product.id}`,
      name: product.name || product.id,
      description: product.description || "",
      label: digitalTypeLabel(product),
      href: product.courseUri,
      action: "Open content",
      isDownload: false,
    };
  }
  if (product.type === "digital_file") {
    return {
      key: `digital:${product.id}`,
      name: product.name || product.id,
      description: product.description || "",
      label: digitalTypeLabel(product),
      href: `/digital/${encodeURIComponent(product.slug || product.id)}`,
      action: "Download",
      isDownload: false,
    };
  }
  return {
    key: `digital:${product.id}`,
    name: product.name || product.id,
    description: product.description || "",
    label: digitalTypeLabel(product),
    href: `/shop/${encodeURIComponent(product.slug || product.id)}`,
    action: "Open product",
    isDownload: false,
  };
}

function buildFallbackDigitalItem(productId) {
  return {
    key: `digital-missing:${productId}`,
    name: `Product ${productId}`,
    description: "This purchase exists, but the product record is no longer available.",
    label: "Unavailable product",
    href: "",
    action: "",
    isDownload: false,
  };
}

function buildOwnedUriItem(uri, shopItem) {
  if (shopItem) {
    return {
      key: `uri:${uri}`,
      name: shopItem.name || uri,
      description: shopItem.description || "",
      label: shopTypeLabel(shopItem.type),
      href: shopItem.uri,
      action: "Open content",
      isDownload: false,
    };
  }
  return {
    key: `uri:${uri}`,
    name: uri,
    description: "You have access to this protected URI.",
    label: "Protected content",
    href: uri,
    action: "Open content",
    isDownload: false,
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

  const [ownedProductIds, digitalProducts, courseAccessState, shopItems] =
    await Promise.all([
      listAccessibleDigitalProductIds(safeEmail).catch((err) => {
        appendServerLog({
          level: "error",
          msg: `inventory: listAccessibleDigitalProductIds failed for ${safeEmail}: ${err?.message || err}`,
        }).catch(() => {});
        return [];
      }),
      listDigitalProducts({ includeInactive: true }).catch((err) => {
        appendServerLog({
          level: "error",
          msg: `inventory: listDigitalProducts failed: ${err?.message || err}`,
        }).catch(() => {});
        return [];
      }),
      getCourseAccessState().catch((err) => {
        appendServerLog({
          level: "error",
          msg: `inventory: getCourseAccessState failed: ${err?.message || err}`,
        }).catch(() => {});
        return { courses: {} };
      }),
      listAllShopItems().catch((err) => {
        appendServerLog({
          level: "error",
          msg: `inventory: listAllShopItems failed: ${err?.message || err}`,
        }).catch(() => {});
        return [];
      }),
    ]);

  const digitalById = new Map(digitalProducts.map((product) => [product.id, product]));
  const digitalItems = [];
  const urisCoveredByDigitalItems = new Set();

  for (const productId of ownedProductIds) {
    const product = digitalById.get(productId);
    if (!product) {
      digitalItems.push(buildFallbackDigitalItem(productId));
      continue;
    }
    if (inferMode(product) === "manual_uri" && product.courseUri) {
      urisCoveredByDigitalItems.add(normalizeUri(product.courseUri));
    }
    digitalItems.push(buildDigitalOwnedItem(product));
  }

  const ownedUris = [];
  const courses = courseAccessState?.courses || {};
  for (const [rawUri, config] of Object.entries(courses)) {
    const uri = normalizeUri(rawUri);
    if (!uri) continue;
    const allowedUsers = Array.isArray(config?.allowedUsers)
      ? config.allowedUsers
      : [];
    if (!allowedUsers.some((email) => normalizeEmail(email) === safeEmail)) {
      continue;
    }
    if (urisCoveredByDigitalItems.has(uri)) continue;
    ownedUris.push(uri);
  }

  const shopByUri = new Map();
  for (const item of shopItems) {
    if (item?.source === "digital") continue;
    const uri = normalizeUri(item?.uri || "");
    if (!uri || shopByUri.has(uri)) continue;
    shopByUri.set(uri, item);
  }
  const uriItems = ownedUris.map((uri) => buildOwnedUriItem(uri, shopByUri.get(uri)));

  const inventoryItems = [...digitalItems, ...uriItems].sort((a, b) =>
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
        <p className="text-gray-600 mt-2">All products you have bought.</p>
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
                item.isDownload ? (
                  <a
                    href={item.href}
                    className="inline-block px-4 py-2 rounded bg-teal-700 text-white text-sm hover:bg-teal-600"
                  >
                    {item.action}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    className="inline-block px-4 py-2 rounded bg-teal-700 text-white text-sm hover:bg-teal-600"
                  >
                    {item.action}
                  </Link>
                )
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
