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
  "/README.md": "readme",
  "docs/README.md": "readme",
  "/docs/README.md": "readme",
  "README.sv.md": "readme-sv",
  "/README.sv.md": "readme-sv",
  "docs/README.sv.md": "readme-sv",
  "/docs/README.sv.md": "readme-sv",
  "README.en.md": "readme-en",
  "/README.en.md": "readme-en",
  "docs/README.en.md": "readme-en",
  "/docs/README.en.md": "readme-en",
  "cloudflare-workers-deploy.md": "cloudflare-workers-deploy",
  "/cloudflare-workers-deploy.md": "cloudflare-workers-deploy",
  "docs/cloudflare-workers-deploy.md": "cloudflare-workers-deploy",
  "/docs/cloudflare-workers-deploy.md": "cloudflare-workers-deploy",
  "wordpress-learnpress-course-access.md": "wordpress-learnpress",
  "/wordpress-learnpress-course-access.md": "wordpress-learnpress",
  "docs/wordpress-learnpress-course-access.md": "wordpress-learnpress",
  "/docs/wordpress-learnpress-course-access.md": "wordpress-learnpress",
};

/** Rewrite relative .md links to /admin/docs/<slug> routes. */
function rewriteHref(href) {
  if (!href) return href;
  // Strip leading ./ or ../ and keep compatibility for /docs/*.md links.
  const clean = href.replace(/^\.\.?\//, "").trim();
  // Split off any #anchor
  const [file, anchor] = clean.split("#");
  const normalized = file.replace(/^\.\.?\//, "");
  const withoutLeadingSlash = normalized.replace(/^\/+/, "");
  const slug =
    fileToSlug[file] ||
    fileToSlug[`../${file}`] ||
    fileToSlug[normalized] ||
    fileToSlug[withoutLeadingSlash] ||
    fileToSlug[`/${withoutLeadingSlash}`];
  if (slug) {
    return `/admin/docs/${slug}${anchor ? `#${anchor}` : ""}`;
  }
  if (normalized.startsWith("docs/")) {
    return `/admin/docs${anchor ? `#${anchor}` : ""}`;
  }
  return href;
}

function buildMermaidImageUrl(definition) {
  const source = String(definition || "").trim();
  if (!source) return "";
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return `https://mermaid.ink/img/${encodeURIComponent(encoded)}`;
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
    pre({ children, ...props }) {
      const codeNode = Array.isArray(children) ? children[0] : children;
      const className = String(codeNode?.props?.className || "");
      const isMermaid = /\blanguage-mermaid\b/i.test(className);
      if (!isMermaid) {
        return <pre {...props}>{children}</pre>;
      }
      const source = codeNode?.props?.children;
      const code = Array.isArray(source) ? source.join("") : String(source || "");
      const src = buildMermaidImageUrl(code);
      if (!src) return <pre {...props}>{children}</pre>;
      return (
        <figure className="my-6 rounded border border-gray-300 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Mermaid diagram"
            className="w-full h-auto"
            loading="lazy"
            decoding="async"
          />
        </figure>
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
