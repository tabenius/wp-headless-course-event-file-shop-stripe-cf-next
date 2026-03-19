export function detectLanguage(text) {
  const lowered = text.toLowerCase();
  const spanishWords = ["y", "de", "que", "el", "la", "en", "no", "lo"];
  const swedishWords = ["och", "är", "inte", "det", "som", "på", "har", "från"];
  const swedishDiacritics = /[åäöÅÄÖ]/;
  const spanishDiacritics = /[áéíóúñÁÉÍÓÚÑ]/;
  if (swedishDiacritics.test(text)) return "Swedish";
  if (spanishDiacritics.test(text)) return "Spanish";
  if (swedishWords.some((word) => lowered.includes(` ${word} `))) return "Swedish";
  if (spanishWords.some((word) => lowered.includes(` ${word} `))) return "Spanish";
  return "English";
}
