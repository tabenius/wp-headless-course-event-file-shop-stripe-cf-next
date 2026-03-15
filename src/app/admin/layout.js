import AdminHeader from "@/components/admin/AdminHeader";
import site from "@/lib/site";

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminHeader logoUrl={site.logoUrl} />
      {children}
    </div>
  );
}
