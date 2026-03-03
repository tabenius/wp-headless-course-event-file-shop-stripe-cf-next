import { redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const metadata = {
  title: "Admin för kursåtkomst",
};

export default async function AdminPage() {
  const session = await adminAuth();
  if (!session) {
    redirect("/admin/login");
  }
  return <AdminDashboard />;
}
