"use client";

import BuyableIcon from "./BuyableIcon";

function rowBackground(index) {
  return index % 2 === 0 ? "bg-purple-50" : "bg-purple-100";
}

export default function ProductRow({
  active,
  onClick,
  rowIndex,
  title,
  meta,
  image,
  configured,
  badgeNode,
  showBuyableIcon = true,
}) {
  const metaText = Array.isArray(meta)
    ? meta.filter(Boolean).join(" · ")
    : meta || "";
  const buttonClasses = active
    ? "bg-purple-100 border border-purple-500"
    : `border border-gray-900 hover:bg-purple-50 ${rowBackground(rowIndex)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${buttonClasses}`}
    >
      {showBuyableIcon && <BuyableIcon configured={configured} />}
      {image}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {metaText && (
          <p className="text-xs text-gray-500 truncate">{metaText}</p>
        )}
      </div>
      {badgeNode}
    </button>
  );
}
