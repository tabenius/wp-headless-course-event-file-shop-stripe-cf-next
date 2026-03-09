import { redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import Link from "next/link";
import { t } from "@/lib/i18n";

const docs = [
  { slug: "readme-sv", title: "Teknisk referens (Svenska)" },
  { slug: "readme-en", title: "Technical Reference (English)" },
  { slug: "cloudflare-workers-deploy", title: "Cloudflare Workers-deploy" },
  { slug: "wordpress-learnpress", title: "WordPress + LearnPress Setup" },
];

export const metadata = { title: "Documentation" };

export default async function DocsIndexPage() {
  const session = await adminAuth();
  if (!session) redirect("/admin/login");

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">{t("admin.documentation")}</h1>
      <ul className="space-y-3">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/admin/docs/${doc.slug}`}
              className="text-lg hover:underline"
            >
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8">
        <Link href="/admin" className="text-sm hover:underline">
          &larr; {t("common.back")}
        </Link>
      </p>
    </section>
  );
}
