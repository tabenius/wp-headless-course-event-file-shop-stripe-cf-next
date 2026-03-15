import { Montserrat, Merriweather } from "next/font/google";
import "./globals.css";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import site from "@/lib/site";

// Variable fonts: one file per family covers all weights (vs 5 separate files)
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: {
    default: site.name,
    template: `%s | ${site.shortName}`,
  },
  description: site.description,
  generator: "RAGBAZ Articulate StoreFront",
  metadataBase: new URL(site.url),
  openGraph: {
    siteName: site.name,
    locale: site.locale,
    type: "website",
    images: [
      {
        url: site.logoUrl,
        width: site.logo.width,
        height: site.logo.height,
        alt: site.logo.alt,
      },
    ],
  },
  twitter: {
    card: "summary",
    description: site.description,
  },
  icons: {
    icon: site.faviconUrl,
    apple: site.appleIconUrl,
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: site.url,
  logo: site.logoUrl,
  description: site.tagline,
  sameAs: site.socialLinks,
  contactPoint: {
    "@type": "ContactPoint",
    email: site.contact.email,
    telephone: site.contact.phone,
    contactType: "customer service",
    availableLanguage: "Swedish",
  },
};

// Tiny blurred placeholder inlined as data URI — paints instantly before bg loads
const bgPlaceholder =
  "data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADwAgCdASogABUAPzmSvFg0qiWjqAqqkCcJaQAAO4n8gAD+7UM5ZWObmXzS3IAAAAA=";

export default function RootLayout({ children }) {
  return (
    <html lang={site.lang}>
      <head>
        <link rel="preconnect" href={site.url} />
        <link rel="dns-prefetch" href={site.url} />
        <link rel="preload" href={site.logoUrl} as="image" type="image/png" fetchPriority="high" />
        <link rel="preload" href={site.bgImageUrl} as="image" type="image/webp" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body
        className={`${montserrat.variable} ${merriweather.variable} antialiased`}
        style={{ "--bg-image": `url(${bgPlaceholder})` }}
      >
        {/* Swap in the real bg after it loads */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var i=new Image();i.onload=function(){document.body.style.setProperty('--bg-image','url(${site.bgImageUrl})')};i.src='${site.bgImageUrl}'})()`,
          }}
        />
        <main className="text-gray-800 min-h-screen pt-16 lg:pt-[68px]">
          <Header />
          {children}
          <Footer />
        </main>
      </body>
    </html>
  );
}
