import { redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import Link from "next/link";
import { t } from "@/lib/i18n";

const docs = [
  { slug: "architecture", titleSv: "Arkitektur", titleEn: "Architecture Overview" },
  { slug: "readme", titleSv: "Översikt & Quickstart", titleEn: "README — Overview & Quickstart" },
  { slug: "cloudflare-workers-deploy", titleSv: "Cloudflare Workers-deploy", titleEn: "Cloudflare Workers-deploy" },
  { slug: "wordpress-learnpress", titleSv: "WordPress + LearnPress-installation", titleEn: "WordPress + LearnPress Setup" },
];

export const metadata = { title: "Documentation" };

export default async function DocsIndexPage() {
  const session = await adminAuth();
  if (!session) redirect("/admin/login");

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">{t("admin.documentation")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Svenska</h2>
          <ul className="space-y-3">
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/admin/docs/${doc.slug}-sv`}
                  className="text-base hover:underline"
                >
                  {doc.titleSv}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">English</h2>
          <ul className="space-y-3">
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/admin/docs/${doc.slug}-en`}
                  className="text-base hover:underline"
                >
                  {doc.titleEn}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-8">
        <Link href="/admin" className="text-sm hover:underline">
          &larr; {t("common.back")}
        </Link>
      </p>
    </section>
  );
}
