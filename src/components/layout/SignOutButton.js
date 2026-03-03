"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton({ className = "" }) {
  const router = useRouter();

  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      Logga ut
    </button>
  );
}
