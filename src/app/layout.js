import { Montserrat, Merriweather } from "next/font/google";
import "./globals.css";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PagePerformanceLogger from "@/components/common/PagePerformanceLogger";
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
        <link
          rel="preload"
          href={site.logoUrl}
          as="image"
          type="image/png"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href={site.bgImageUrl}
          as="image"
          type="image/webp"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark-mode');}}catch(_){}})();",
          }}
        />
        <link rel="stylesheet" href="/api/site-fonts" />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var KEY='ragbaz-site-style';var root=document.documentElement;var colorMap={background:'--color-background',foreground:'--color-foreground',primary:'--color-primary',secondary:'--color-secondary',tertiary:'--color-tertiary',muted:'--color-muted'};var fontRoleMap={fontDisplay:'--font-display',fontHeading:'--font-heading',fontSubheading:'--font-subheading',fontBody:'--font-body',fontButton:'--font-button'};var colorRoles={fontDisplay:'--font-color-display',fontHeading:'--font-color-heading',fontSubheading:'--font-color-subheading'};function fontFamilyValue(role){if(!role||typeof role!=='object')return null;if(role.type==='preset')return role.stack||null;if(role.type==='google')return"'"+role.family+"', system-ui, sans-serif";return null;}function apply(style){if(!style||typeof style!=='object')return;for(var k in colorMap){if(!Object.prototype.hasOwnProperty.call(colorMap,k))continue;var v=style[k];if(typeof v==='string'&&v.trim())root.style.setProperty(colorMap[k],v.trim());}root.style.setProperty('--background','var(--color-background)');root.style.setProperty('--foreground','var(--color-foreground)');for(var role in fontRoleMap){if(!Object.prototype.hasOwnProperty.call(fontRoleMap,role))continue;var roleData=style[role];var cssVar=fontRoleMap[role];var fv=null;if(roleData&&typeof roleData==='object'){fv=fontFamilyValue(roleData);}if(!fv&&typeof roleData==='string'&&roleData.trim()&&roleData!=='upstream'){fv=roleData.trim();}if(fv)root.style.setProperty(cssVar,fv);}var palette=Array.isArray(style.typographyPalette)?style.typographyPalette:['#111111'];for(var cr in colorRoles){if(!Object.prototype.hasOwnProperty.call(colorRoles,cr))continue;var roleObj=style[cr];var slot=roleObj&&typeof roleObj==='object'?roleObj.colorSlot:null;var hex=slot&&palette[slot-1]?palette[slot-1]:null;if(hex)root.style.setProperty(colorRoles[cr],hex);}var linkStyle=style.linkStyle&&typeof style.linkStyle==='object'?style.linkStyle:{};var hoverVariant=linkStyle.hoverVariant||'underline';var underlineDefault=linkStyle.underlineDefault||'hover';document.body.setAttribute('data-link-style',hoverVariant);document.body.setAttribute('data-link-underline',underlineDefault);var cta=style.ctaStyle;if(cta&&typeof cta==='object'&&cta.type!=='upstream'&&cta.bgColor){var clr={primary:'var(--color-primary)',secondary:'var(--color-secondary)',foreground:'var(--color-foreground)',background:'var(--color-background)'};var rc=function(slot,custom){return slot==='custom'?(custom||''):(clr[slot]||'');};var radMap={none:'0px',sm:'4px',md:'8px',lg:'16px',full:'9999px'};var padMap={sm:['0.375rem','0.875rem'],md:['0.625rem','1.25rem'],lg:['0.875rem','1.75rem']};var shdMap={none:'none',sm:'0 1px 2px rgba(0,0,0,.08)',md:'0 4px 6px rgba(0,0,0,.10)'};var fwMap={normal:400,medium:500,semibold:600,bold:700};root.style.setProperty('--btn-bg',rc(cta.bgColor,cta.bgCustom));root.style.setProperty('--btn-color',rc(cta.textColor,cta.textCustom));root.style.setProperty('--btn-radius',radMap[cta.borderRadius]||'8px');root.style.setProperty('--btn-border-width',cta.border==='solid'?'1px':'0px');root.style.setProperty('--btn-border-color',cta.border==='solid'?rc(cta.borderColor,cta.borderCustom):'transparent');root.style.setProperty('--btn-shadow',shdMap[cta.shadow]||'none');root.style.setProperty('--btn-font-weight',String(fwMap[cta.fontWeight]||600));root.style.setProperty('--btn-text-transform',cta.textTransform||'none');var pad=padMap[cta.paddingSize]||padMap.md;root.style.setProperty('--btn-padding-x',pad[1]);root.style.setProperty('--btn-padding-y',pad[0]);}}try{var cached=localStorage.getItem(KEY);if(cached)apply(JSON.parse(cached));}catch(_){}fetch('/api/site-style').then(function(res){return res.ok?res.json():null;}).then(function(payload){if(!payload||payload.ok!==true||!payload.siteStyle)return;apply(payload.siteStyle);try{localStorage.setItem(KEY,JSON.stringify(payload.siteStyle));}catch(_){}}).catch(function(){});})()`,
          }}
        />
        <PagePerformanceLogger />
        <main className="text-gray-800 min-h-screen pt-16 lg:pt-[68px]">
          <Header />
          {children}
          <Footer />
        </main>
      </body>
    </html>
  );
}
