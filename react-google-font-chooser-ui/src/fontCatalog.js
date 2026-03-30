export const DEFAULT_FONT_CATALOG = [
  {
    family: "Inter",
    category: "sans-serif",
    axes: [
      { tag: "wght", min: 100, max: 900, default: 400, step: 1 },
      { tag: "opsz", min: 14, max: 32, default: 14, step: 1 },
    ],
  },
  {
    family: "Roboto Flex",
    category: "sans-serif",
    axes: [
      { tag: "wght", min: 100, max: 1000, default: 400, step: 1 },
      { tag: "opsz", min: 8, max: 144, default: 14, step: 1 },
      { tag: "wdth", min: 25, max: 151, default: 100, step: 1 },
      { tag: "GRAD", min: -50, max: 200, default: 0, step: 1 },
    ],
  },
  {
    family: "Fraunces",
    category: "serif",
    axes: [
      { tag: "wght", min: 100, max: 900, default: 400, step: 1 },
      { tag: "opsz", min: 9, max: 144, default: 14, step: 1 },
      { tag: "SOFT", min: 0, max: 100, default: 0, step: 1 },
      { tag: "WONK", min: 0, max: 1, default: 0, step: 1 },
    ],
  },
  {
    family: "Bricolage Grotesque",
    category: "sans-serif",
    axes: [
      { tag: "wght", min: 200, max: 800, default: 400, step: 1 },
      { tag: "opsz", min: 12, max: 96, default: 14, step: 1 },
      { tag: "wdth", min: 75, max: 100, default: 100, step: 1 },
    ],
  },
  {
    family: "Commissioner",
    category: "sans-serif",
    axes: [
      { tag: "wght", min: 100, max: 900, default: 400, step: 1 },
      { tag: "slnt", min: -12, max: 0, default: 0, step: 1 },
    ],
  },
  {
    family: "Manrope",
    category: "sans-serif",
    axes: [{ tag: "wght", min: 200, max: 800, default: 400, step: 1 }],
  },
  {
    family: "Space Grotesk",
    category: "sans-serif",
    axes: [{ tag: "wght", min: 300, max: 700, default: 400, step: 1 }],
  },
  {
    family: "Playfair Display",
    category: "serif",
    axes: [{ tag: "wght", min: 400, max: 900, default: 400, step: 1 }],
  },
  {
    family: "Cormorant Garamond",
    category: "serif",
    axes: [{ tag: "wght", min: 300, max: 700, default: 400, step: 1 }],
  },
  {
    family: "DM Serif Display",
    category: "serif",
    axes: [{ tag: "wght", min: 400, max: 700, default: 400, step: 1 }],
  },
  {
    family: "Sora",
    category: "sans-serif",
    axes: [{ tag: "wght", min: 100, max: 800, default: 400, step: 1 }],
  },
  {
    family: "Outfit",
    category: "sans-serif",
    axes: [{ tag: "wght", min: 100, max: 900, default: 400, step: 1 }],
  },
  {
    family: "Space Mono",
    category: "monospace",
    axes: [{ tag: "wght", min: 400, max: 700, default: 400, step: 1 }],
  },
  {
    family: "IBM Plex Mono",
    category: "monospace",
    axes: [{ tag: "wght", min: 100, max: 700, default: 400, step: 1 }],
  },
  {
    family: "Dancing Script",
    category: "handwriting",
    axes: [{ tag: "wght", min: 400, max: 700, default: 400, step: 1 }],
  },
  {
    family: "Caveat",
    category: "handwriting",
    axes: [{ tag: "wght", min: 400, max: 700, default: 400, step: 1 }],
  },
];

export const FONT_CATEGORIES = [
  "all",
  "sans-serif",
  "serif",
  "monospace",
  "handwriting",
];
