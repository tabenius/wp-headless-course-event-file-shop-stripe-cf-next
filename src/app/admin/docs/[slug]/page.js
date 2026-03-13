import { notFound, redirect } from "next/navigation";
import { adminAuth } from "@/auth";
import Link from "next/link";
import { t } from "@/lib/i18n";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ArchitectureDiagram from "./ArchitectureDiagram";

import mainReadme from "../../../../../README.md";
import readmeSv from "../../../../../docs/README.sv.md";
import readmeEn from "../../../../../docs/README.en.md";
import cfDeploy from "../../../../../docs/cloudflare-workers-deploy.md";
import wpLearnpress from "../../../../../docs/wordpress-learnpress-course-access.md";

const slugToContent = {
  readme: mainReadme,
  "readme-sv": readmeSv,
  "readme-en": readmeEn,
  "cloudflare-workers-deploy": cfDeploy,
  "wordpress-learnpress": wpLearnpress,
  architecture: null,
};

const titles = {
  readme: "README",
  "readme-sv": "Teknisk referens (SV)",
  "readme-en": "Technical Reference (EN)",
  "cloudflare-workers-deploy": "Cloudflare Workers Deploy",
  "wordpress-learnpress": "WordPress + LearnPress",
  architecture: "Architecture Overview",
};

/** Map relative .md file paths used in the docs to their slug equivalents. */
const fileToSlug = {
  "../README.md": "readme",
  "README.md": "readme",
  "README.sv.md": "readme-sv",
  "README.en.md": "readme-en",
  "cloudflare-workers-deploy.md": "cloudflare-workers-deploy",
  "wordpress-learnpress-course-access.md": "wordpress-learnpress",
};

/** Rewrite relative .md links to /admin/docs/<slug> routes. */
function rewriteHref(href) {
  if (!href) return href;
  // Strip leading ./ or ../
  const clean = href.replace(/^\.\.?\//, "");
  // Split off any #anchor
  const [file, anchor] = clean.split("#");
  const slug = fileToSlug[file] || fileToSlug[`../${file}`];
  if (slug) {
    return `/admin/docs/${slug}${anchor ? `#${anchor}` : ""}`;
  }
  return href;
}

export async function generateMetadata({ params: paramsPromise }) {
  const { slug } = await paramsPromise;
  return { title: titles[slug] || "Documentation" };
}

export default async function DocPage({ params: paramsPromise }) {
  const session = await adminAuth();
  if (!session) redirect("/admin/login");

  const { slug } = await paramsPromise;
  if (!(slug in slugToContent)) notFound();

  const backLink = (
    <p className="mb-6">
      <Link href="/admin/docs" className="text-sm hover:underline">
        &larr; {t("admin.documentation")}
      </Link>
    </p>
  );

  if (slug === "architecture") {
    return (
      <section className="max-w-4xl mx-auto px-6 py-16">
        {backLink}
        <h1 className="text-3xl font-bold mb-8">{titles[slug]}</h1>
        <ArchitectureDiagram />
        <p className="mt-8">
          <Link href="/admin/docs" className="text-sm hover:underline">
            &larr; {t("admin.documentation")}
          </Link>
        </p>
      </section>
    );
  }

  const components = {
    a({ href, children, ...props }) {
      const resolved = rewriteHref(href);
      const isInternal = resolved.startsWith("/");
      if (isInternal) {
        return (
          <Link href={resolved} {...props}>
            {children}
          </Link>
        );
      }
      return (
        <a href={resolved} {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      {backLink}
      <article className="prose prose-gray max-w-none">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {slugToContent[slug]}
        </Markdown>
      </article>
      <p className="mt-8">
        <Link href="/admin/docs" className="text-sm hover:underline">
          &larr; {t("admin.documentation")}
        </Link>
      </p>
    </section>
  );
}
