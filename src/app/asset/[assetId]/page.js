import { redirect } from "next/navigation";

export default async function AssetRedirect({ params: paramsPromise }) {
  const params = await paramsPromise;
  const assetId = params?.assetId || "";
  redirect(`/assets/${encodeURIComponent(assetId)}`);
}
