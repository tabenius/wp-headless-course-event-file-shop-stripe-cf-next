import enRaw from "@/../docs/README.en.md?raw";
import svRaw from "@/../docs/README.sv.md?raw";

const DOCS_BASE = String(
  process.env.NEXT_PUBLIC_RAGBAZ_DOCS_BASE_URL || "https://ragbaz.xyz/docs",
).replace(/\/+$/, "");
const DOCS_URLS = {
  en: `${DOCS_BASE}/en/technical-manual`,
  sv: `${DOCS_BASE}/sv/technical-manual`,
  es: `${DOCS_BASE}/es/technical-manual`,
};

const STYLE_GUIDE = `
# Site Style Guide

## Main site (public-facing)

### Colors
- Background: #f0d0d0 (very light rose/cream) — CSS var: --color-background
- Foreground / text: #1a1a1a — CSS var: --color-foreground
- Primary: #6d003e (deep magenta / dark crimson) — CSS var: --color-primary
- Secondary: #ffb606 (amber / golden yellow) — CSS var: --color-secondary
- Tertiary: #442e66 (deep purple) — CSS var: --color-tertiary
- Muted: #686868 (mid gray) — CSS var: --color-muted

### Typography
- Heading font: Montserrat (sans-serif) — CSS var: --font-heading
- Body font: Merriweather (serif) — CSS var: --font-body
- Base body size: 16px, line-height 1.5

### Buttons & controls
- Primary button: background #6d003e, white text
- Tertiary button: background #442e66, white text
- Outline button: border and text #6d003e
- Badges: background #ffb606, dark text, rounded-full

### Tailwind CSS classes used on the main site
- Primary CTA: bg-gray-800 text-white hover:bg-gray-700 (shop) or use CSS var colors
- Shop CTA class: .shop-cta
- Rounded corners: rounded or rounded-lg
- Max content width: max-w-6xl mx-auto px-6

## Admin UI style

### Colors
- Page background: #140022 (very dark purple-black)
- Accent / border: #4e21a6 (medium purple)
- Primary interactive: #7c3aed (purple-600)
- Light purple: #a78bfa (purple-400)
- Surface cards: white (#ffffff)
- Muted text: #6b7280 (gray-500)

### Typography
- System UI / sans-serif at 14–16px
- Heading: text-xl font-semibold or text-2xl font-semibold
- Labels: text-xs uppercase tracking-wide

### Buttons
- Primary: bg-purple-600 text-white hover:bg-purple-700 px-4 py-2 rounded
- Danger: hover:text-red-500
- Disabled: opacity-50
`;

export const manuals = [
  { title: "Docs (EN)", uri: DOCS_URLS.en, text: enRaw },
  { title: "Docs (SV)", uri: DOCS_URLS.sv, text: svRaw },
  {
    title: "Style Guide",
    uri: DOCS_URLS.en,
    text: STYLE_GUIDE,
  },
];
