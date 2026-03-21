import { redirect } from "next/navigation";

export const metadata = {
  title: "Profile",
  alternates: { canonical: "/profile" },
};

export default async function ProfilePage() {
  redirect("/me");
}
