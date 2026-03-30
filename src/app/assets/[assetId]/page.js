import Link from "next/link";
import { notFound } from "next/navigation";
import { adminAuth } from "@/auth";
import { getDigitalProductByAssetId } from "@/lib/digitalProducts";

export const dynamic = "force-dynamic";

export default async function AdminAssetPage({ params: paramsPromise }) {
  const adminSession = await adminAuth();
  if (!adminSession) {
    notFound();
  }

  const params = await paramsPromise;
  const assetIdRaw = typeof params?.assetId === "string" ? params.assetId : "";
  const assetId = decodeURIComponent(assetIdRaw).trim().toLowerCase();
  if (!assetId) {
    notFound();
  }

  const linkedProduct = await getDigitalProductByAssetId(assetId);

  return (
    <section className="mx-auto max-w-4xl px-6 py-16 space-y-6">
      <h1 className="text-3xl font-bold">Asset {assetId}</h1>
      <p className="text-gray-700">
        This admin-only asset endpoint is active. Asset/product mount points are
        derived dynamically from identifiers, not stored as product URIs.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Asset root:</span> `/assets/{assetId}`
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Buyable mount:</span>{" "}
          `/shop/{assetId}`
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Owned mount:</span>{" "}
          `/inventory/{assetId}`
        </p>
      </div>

      {linkedProduct ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-sm text-emerald-900">
            Linked product: <strong>{linkedProduct.name}</strong>
          </p>
          <p className="text-xs text-emerald-800">Product id: {linkedProduct.id}</p>
          <p>
            <Link
              href={`/shop/${encodeURIComponent(assetId)}`}
              className="text-sm text-emerald-800 hover:underline"
            >
              Open buyable product view
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          No product is currently linked to this asset id.
        </p>
      )}
    </section>
  );
}
