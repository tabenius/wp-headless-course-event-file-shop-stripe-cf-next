"use client";

export default function RagbazLogo({
  className = "",
  includeStoreFront = true,
  color = "#39b6f2",
  size = "normal",
  scale = 1,
  wordmarkOnly = false,
  noLetterSpacing = false,
  outlineColor = "",
  outlineWidth = 0,
}) {
  const isDouble = size === "2x";
  const lineWidth = includeStoreFront
    ? isDouble
      ? "22.8ch"
      : "11.4ch"
    : isDouble
      ? "21.6ch"
      : "10.8ch";

  const sizeScale =
    typeof scale === "number" && Number.isFinite(scale) && scale > 0
      ? scale
      : 1;

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

  const ragbazSize = `${Number.parseFloat(fontSize.ragbaz) * sizeScale}rem`;
  const articulateSize = `${Number.parseFloat(fontSize.articulate) * sizeScale}rem`;
  const storefrontSize = `${Number.parseFloat(fontSize.storefront) * sizeScale}rem`;
  const hasOutline = Boolean(outlineColor) && Number(outlineWidth) > 0;
  const strokeWidth =
    typeof outlineWidth === "number" ? `${outlineWidth}px` : String(outlineWidth);
  const outlineShadow = hasOutline
    ? [
        "0 1px 0",
        "1px 0 0",
        "0 -1px 0",
        "-1px 0 0",
        "1px 1px 0",
        "-1px 1px 0",
        "1px -1px 0",
        "-1px -1px 0",
      ]
        .map((offset) => `${offset} ${outlineColor}`)
        .join(", ")
    : undefined;

  const ragbazLetterSpacing = noLetterSpacing ? "0" : "0.24em";
  const articulateLetterSpacing = noLetterSpacing ? "0" : "0.135em";
  const storefrontLetterSpacing = noLetterSpacing ? "0" : "0.34em";

  if (wordmarkOnly) {
    return (
      <div className={`inline-flex items-center leading-[0.92] ${className}`}>
        <span
          className="block uppercase font-black"
        style={{
            fontSize: ragbazSize,
            textAlign: "center",
            letterSpacing: ragbazLetterSpacing,
            transform: "scaleX(1.12)",
            transformOrigin: "center",
            fontFamily:
              "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
            color,
            WebkitTextStroke: hasOutline
              ? `${strokeWidth} ${outlineColor}`
              : undefined,
            paintOrder: hasOutline ? "stroke fill" : undefined,
            textShadow: outlineShadow,
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
          fontSize: ragbazSize,
          textAlign: "center",
          letterSpacing: ragbazLetterSpacing,
          transform: "scaleX(1.12)",
          transformOrigin: "center",
          fontFamily:
            "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
          color,
          WebkitTextStroke: hasOutline
            ? `${strokeWidth} ${outlineColor}`
            : undefined,
          paintOrder: hasOutline ? "stroke fill" : undefined,
          textShadow: outlineShadow,
        }}
      >
        RAGBAZ
      </span>
      <span
        className="block -mt-[0.12rem] font-medium"
        style={{
          width: lineWidth,
          fontSize: articulateSize,
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
            fontSize: storefrontSize,
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
