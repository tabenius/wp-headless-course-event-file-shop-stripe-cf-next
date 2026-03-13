import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";
import { t } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: t("resetPassword.title") };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<section className="max-w-md mx-auto px-6 py-16">{t("common.loading")}</section>}>
      <ResetPasswordClient />
    </Suspense>
  );
}
