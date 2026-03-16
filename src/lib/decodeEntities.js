const ENTITY_MAP = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(value) {
  if (typeof value !== "string") return value;
  return value
    // named entities
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITY_MAP[name] ?? m)
    // numeric entities (decimal or hex)
    .replace(/&#(x?)([0-9a-fA-F]+);/g, (m, hex, code) => {
      const num = parseInt(code, hex ? 16 : 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    });
}
