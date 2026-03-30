import ShopIndex from "@/components/shop/ShopIndex";
import { StorefrontGridSkeleton } from "@/components/common/StorefrontSkeletons";
import { listAllShopItems } from "@/lib/shopProducts";
import { isStripeEnabled } from "@/lib/stripe";
import site from "@/lib/site";
import { Suspense } from "react";

export const metadata = {
  title: site.pages.shop.title,
  description: site.pages.shop.description,
  alternates: { canonical: "/shop" },
};
export const revalidate = 300;

async function ShopPageContent() {
  const items = await listAllShopItems();

  return (
    <ShopIndex
      items={items}
      stripeEnabled={isStripeEnabled()}
    />
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<StorefrontGridSkeleton items={8} />}>
      <ShopPageContent />
    </Suspense>
  );
}
