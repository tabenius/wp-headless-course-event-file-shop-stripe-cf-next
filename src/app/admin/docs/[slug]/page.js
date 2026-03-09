import { notFound, redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import Link from "next/link";
import { t } from "@/lib/i18n";
import Markdown from "react-markdown";

const slugToFile = {
  "readme-sv": "docs/README.sv.md",
  "readme-en": "docs/README.en.md",
  "cloudflare-workers-deploy": "docs/cloudflare-workers-deploy.md",
  "wordpress-learnpress": "docs/wordpress-learnpress-course-access.md",
};

export async function generateMetadata({ params: paramsPromise }) {
  const { slug } = await paramsPromise;
  const titles = {
    "readme-sv": "Teknisk referens (SV)",
    "readme-en": "Technical Reference (EN)",
    "cloudflare-workers-deploy": "Cloudflare Workers Deploy",
    "wordpress-learnpress": "WordPress + LearnPress",
  };
  return { title: titles[slug] || "Documentation" };
}

export default async function DocPage({ params: paramsPromise }) {
  const session = await adminAuth();
  if (!session) redirect("/admin/login");

  const { slug } = await paramsPromise;
  const file = slugToFile[slug];
  if (!file) notFound();

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = path.join(process.cwd(), file);

  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    notFound();
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <p className="mb-6">
        <Link href="/admin/docs" className="text-sm hover:underline">
          &larr; {t("admin.documentation")}
        </Link>
      </p>
      <article className="prose prose-gray max-w-none">
        <Markdown>{content}</Markdown>
      </article>
      <p className="mt-8">
        <Link href="/admin/docs" className="text-sm hover:underline">
          &larr; {t("admin.documentation")}
        </Link>
      </p>
    </section>
  );
}
