"use client";

export default function RagbazLogo({
  className = "",
  includeStoreFront = true,
  color = "#39b6f2",
  size = "normal",
  wordmarkOnly = false,
  noLetterSpacing = false,
}) {
  const isDouble = size === "2x";
  const lineWidth = includeStoreFront
    ? isDouble
      ? "22.8ch"
      : "11.4ch"
    : isDouble
      ? "21.6ch"
      : "10.8ch";

  const fontSize = isDouble
    ? {
        ragbaz: "2.08rem",
        articulate: "2.02rem",
        storefront: "1.34rem",
      }
    : {
        ragbaz: "1.04rem",
        articulate: "1.01rem",
        storefront: "0.67rem",
      };

  const ragbazLetterSpacing = noLetterSpacing ? "0" : "0.24em";
  const articulateLetterSpacing = noLetterSpacing ? "0" : "0.135em";
  const storefrontLetterSpacing = noLetterSpacing ? "0" : "0.34em";

  if (wordmarkOnly) {
    return (
      <div className={`inline-flex items-center leading-[0.92] ${className}`}>
        <span
          className="block uppercase font-black"
          style={{
            fontSize: fontSize.ragbaz,
            textAlign: "center",
            letterSpacing: ragbazLetterSpacing,
            transform: "scaleX(1.12)",
            transformOrigin: "center",
            fontFamily:
              "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
            color,
          }}
        >
          RAGBAZ
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center leading-[0.92] ${className}`}>
      <span
        className="block uppercase font-black"
        style={{
          width: lineWidth,
          fontSize: fontSize.ragbaz,
          textAlign: "center",
          letterSpacing: ragbazLetterSpacing,
          transform: "scaleX(1.12)",
          transformOrigin: "center",
          fontFamily:
            "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
          color,
        }}
      >
        RAGBAZ
      </span>
      <span
        className="block -mt-[0.12rem] font-medium"
        style={{
          width: lineWidth,
          fontSize: fontSize.articulate,
          textAlign: "center",
          letterSpacing: articulateLetterSpacing,
          transform: "scaleX(1.2)",
          transformOrigin: "center",
          fontFamily:
            "var(--font-serif, 'Merriweather', 'Times New Roman', serif)",
          color,
        }}
      >
        Articulate
      </span>
      {includeStoreFront && (
        <span
          className="block -mt-[0.06rem] font-semibold"
          style={{
            width: lineWidth,
            fontSize: fontSize.storefront,
            textAlign: "center",
            letterSpacing: storefrontLetterSpacing,
            transform: "scaleX(1.26)",
            transformOrigin: "center",
            fontFamily:
              "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
            color,
          }}
        >
          StoreFront
        </span>
      )}
    </div>
  );
}
