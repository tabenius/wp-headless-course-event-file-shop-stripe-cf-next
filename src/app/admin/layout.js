import { JetBrains_Mono } from "next/font/google";
import AdminHeader from "@/components/admin/AdminHeader";
import site from "@/lib/site";
import ToastHost from "@/components/common/ToastHost";
import AdminThemeWrapper from "@/components/admin/AdminThemeWrapper";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-admin",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export default function AdminLayout({ children }) {
  return (
    <AdminThemeWrapper fontVariable={jetbrainsMono.variable}>
      <AdminHeader logoUrl={site.logoUrl} />
      <ToastHost />
      {children}
    </AdminThemeWrapper>
  );
}
