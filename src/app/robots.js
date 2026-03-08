import site from "@/lib/site";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/auth/", "/digital-files"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
