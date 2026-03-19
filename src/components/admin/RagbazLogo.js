"use client";

export default function RagbazLogo({
  className = "",
  includeStoreFront = true,
  color = "#39b6f2",
}) {
  const lineWidth = includeStoreFront ? "11.2ch" : "10.7ch";
  return (
    <div className={`inline-flex flex-col items-center leading-[0.92] ${className}`}>
      <span
        className="block uppercase font-black text-[1.02rem] sm:text-[1.08rem]"
        style={{
          width: lineWidth,
          textAlign: "center",
          letterSpacing: "0.24em",
          transform: "scaleX(1.1)",
          transformOrigin: "center",
          fontFamily:
            "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
          color,
        }}
      >
        RAGBAZ
      </span>
      <span
        className="block -mt-[0.10rem] text-[0.99rem] sm:text-[1.03rem] font-medium"
        style={{
          width: lineWidth,
          textAlign: "center",
          letterSpacing: "0.055em",
          transform: "scaleX(1.03)",
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
          className="block -mt-[0.02rem] text-[0.65rem] sm:text-[0.69rem] font-semibold"
          style={{
            width: lineWidth,
            textAlign: "center",
            letterSpacing: "0.2em",
            transform: "scaleX(1.1)",
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
