import { redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { t } from "@/lib/i18n";

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
