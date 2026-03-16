import AdminHeader from "@/components/admin/AdminHeader";
import site from "@/lib/site";
import ToastHost from "@/components/common/ToastHost";

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminHeader logoUrl={site.logoUrl} />
      <ToastHost />
      {children}
    </div>
  );
}
