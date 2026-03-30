import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductByAssetId } from "@/lib/digitalProducts";

export const dynamic = "force-dynamic";

export default async function InventoryAssetPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const assetIdRaw = typeof params?.assetId === "string" ? params.assetId : "";
  const assetId = decodeURIComponent(assetIdRaw).trim().toLowerCase();
  if (!assetId) {
    redirect("/shop");
  }

  const session = await auth();
  const userEmail = session?.user?.email || "";
  if (!userEmail) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/inventory/${assetId}`)}`,
    );
  }

  const product = await getDigitalProductByAssetId(assetId);
  if (!product || !product.active) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 space-y-4">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-gray-700">No purchasable asset found for this id.</p>
        <Link href="/shop" className="text-teal-800 hover:underline">
          Back to shop
        </Link>
      </section>
    );
  }

  const owned = await hasDigitalAccess(product.id, userEmail);
  if (!owned) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 space-y-4">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-red-700">
          You do not currently own this asset product.
        </p>
        <Link
          href={`/shop/${encodeURIComponent(assetId)}`}
          className="text-teal-800 hover:underline"
        >
          Open product page
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-6 py-16 space-y-6">
      <div className="flex items-center gap-4 text-sm">
        <Link href="/inventory" className="text-teal-800 hover:underline">
          Back to inventory
        </Link>
        <Link href="/shop" className="text-teal-800 hover:underline">
          Back to shop
        </Link>
      </div>
      <h1 className="text-3xl font-bold">{product.name}</h1>
      {product.description ? (
        <p className="text-gray-700">{product.description}</p>
      ) : null}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Asset ID:</span> {assetId}
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Product ID:</span> {product.id}
        </p>
        <p className="text-xs text-gray-500">
          Asset root route: `/assets/{assetId}` (admin-only for now).
        </p>
      </div>
    </section>
  );
}
