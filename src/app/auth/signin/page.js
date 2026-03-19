import { Suspense } from "react";
import SignInClient from "./SignInClient";
import { t } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: t("metadata.signIn") };
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <section className="max-w-md mx-auto px-6 py-16">
          {t("common.loading")}
        </section>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
