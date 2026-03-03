import { Suspense } from "react";
import SignInClient from "./SignInClient";

export const metadata = {
  title: "Logga in",
};

export default function SignInPage() {
  return (
    <Suspense fallback={<section className="max-w-md mx-auto px-6 py-16">Laddar...</section>}>
      <SignInClient />
    </Suspense>
  );
}
