import { Suspense } from "react";
import RegisterClient from "./RegisterClient";
import { t } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: t("metadata.register") };
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<section className="max-w-md mx-auto px-6 py-16">{t("common.loading")}</section>}>
      <RegisterClient />
    </Suspense>
  );
}
