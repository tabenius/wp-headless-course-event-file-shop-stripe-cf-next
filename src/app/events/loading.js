import { StorefrontListSkeleton } from "@/components/common/StorefrontSkeletons";

export default function Loading() {
  return <StorefrontListSkeleton items={5} withImage />;
}
