"use client";

import ProductRow from "./ProductRow";

export default function ProductSection({ label, items, renderItem }) {
  if (!items || items.length === 0) return null;
  const rows = items.map((item, index) => ({
    ...renderItem(item, index),
    rowIndex: index,
  }));

  return (
    <>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1">
        {label}
      </p>
      {rows.map((row) => (
        <ProductRow key={row.key} {...row} />
      ))}
    </>
  );
}
