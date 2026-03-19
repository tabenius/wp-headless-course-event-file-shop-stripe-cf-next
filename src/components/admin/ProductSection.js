"use client";

export default function ProductSection({ label, items, renderItem }) {
  if (!items || items.length === 0) return null;

  return (
    <>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1">
        {label}
      </p>
      {items.map((item, index) => renderItem(item, index))}
    </>
  );
}
