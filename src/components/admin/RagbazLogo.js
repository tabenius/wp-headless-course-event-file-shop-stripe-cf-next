"use client";

export default function RagbazLogo({
  className = "",
  includeStoreFront = true,
  color = "currentColor",
}) {
  return (
    <div className={`flex items-end gap-1 ${className}`}>
      <span
        className="text-2xl font-black tracking-tight uppercase"
        style={{
          fontFamily:
            "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
          color,
        }}
      >
        RAGBAZ
      </span>
      <span
        className="text-2xl font-light"
        style={{
          fontFamily:
            "var(--font-serif, 'Merriweather', 'Times New Roman', serif)",
          color,
        }}
      >
        Articulate
      </span>
      {includeStoreFront && (
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            color: "rgba(255, 255, 255, 0.75)",
            fontFamily:
              "var(--font-neo-grotesque, 'Space Grotesk', 'Inter', system-ui, sans-serif)",
          }}
        >
          StoreFront
        </span>
      )}
    </div>
  );
}
