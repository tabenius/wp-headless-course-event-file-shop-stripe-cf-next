import { redirect } from "next/navigation";
import { buildRagbazDocsUrl } from "@/lib/ragbazDocs";

export const metadata = {
  title: "Setup Docs",
  description: "Open the setup guide on ragbaz.xyz.",
};

export default function SetupPage() {
  redirect(buildRagbazDocsUrl({ lang: "en", slug: "quick-start" }));
}
