import ShopIndex from "@/components/shop/ShopIndex";
import { listAllShopItems } from "@/lib/shopProducts";
import { isStripeEnabled } from "@/lib/stripe";
import site from "@/lib/site";

export const metadata = {
  title: site.pages.shop.title,
  description: site.pages.shop.description,
  alternates: { canonical: "/shop" },
};
export const revalidate = 300;

export default async function ShopPage() {
  const items = await listAllShopItems();

  return (
    <ShopIndex
      items={items}
      stripeEnabled={isStripeEnabled()}
    />
  );
}
