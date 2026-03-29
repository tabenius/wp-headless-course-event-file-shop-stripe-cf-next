import { redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import { adminAuth } from "@/auth";
import AdminLoadingShell from "@/components/admin/AdminLoadingShell";
import { t } from "@/lib/i18n";

const AdminDashboard = nextDynamic(() => import("@/components/admin/AdminDashboard"), {
  loading: () => <AdminLoadingShell />,
});

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata() {
  return { title: t("metadata.adminPage") };
}

export default async function AdminPage() {
  try {
    const session = await adminAuth();
    if (!session) {
      redirect("/admin/login");
    }
    return <AdminDashboard />;
  } catch (err) {
    // Re-throw redirect (Next.js uses a special error for redirect())
    if (err?.digest === "NEXT_REDIRECT") throw err;
    console.error("AdminPage render error:", err);
    throw err;
  }
}
