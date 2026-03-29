import "./admin.css";
import AdminHeader from "@/components/admin/AdminHeader";
import site from "@/lib/site";
import ToastHost from "@/components/common/ToastHost";
import AdminThemeWrapper from "@/components/admin/AdminThemeWrapper";

export default function AdminLayout({ children }) {
  return (
    <AdminThemeWrapper>
      <AdminHeader logoUrl={site.logoUrl} />
      <ToastHost />
      {children}
    </AdminThemeWrapper>
  );
}
