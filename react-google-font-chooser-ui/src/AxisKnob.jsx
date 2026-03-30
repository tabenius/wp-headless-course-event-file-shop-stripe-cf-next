"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clampToAxis, normalizeAxisValue } from "./utils";

function toPolar(cx, cy, radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(cx, cy, radius, startDeg, endDeg) {
  const start = toPolar(cx, cy, radius, startDeg);
  const end = toPolar(cx, cy, radius, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function AxisKnob({ axis, value, onChange, onReset }) {
  const min = Number(axis?.min ?? 0);
  const max = Number(axis?.max ?? 100);
  const step = Number(axis?.step ?? 1) || 1;
  const defaultValue = Number(axis?.default ?? min);
  const safeValue = normalizeAxisValue(value, axis);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    startY: 0,
    startValue: safeValue,
  });

  useEffect(() => {
    if (!dragging) return undefined;
    function onMove(event) {
      if (!dragRef.current.active) return;
      const range = Math.max(1, max - min);
      const delta = dragRef.current.startY - event.clientY;
      const next = dragRef.current.startValue + (delta * range) / 160;
      onChange?.(normalizeAxisValue(next, axis));
    }
    function onUp() {
      dragRef.current.active = false;
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [axis, dragging, max, min, onChange]);

  const angle = useMemo(() => {
    const pct = (safeValue - min) / Math.max(1, max - min);
    return -135 + pct * 270;
  }, [max, min, safeValue]);

  function nudge(direction, multiplier = 1) {
    const raw = safeValue + direction * step * multiplier;
    onChange?.(normalizeAxisValue(raw, axis));
  }

  return (
    <div className="rgfc-knob-unit">
      <button
        type="button"
        className={`rgfc-knob ${dragging ? "dragging" : ""}`}
        onPointerDown={(event) => {
          dragRef.current = {
            active: true,
            startY: event.clientY,
            startValue: safeValue,
          };
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onWheel={(event) => {
          event.preventDefault();
          nudge(event.deltaY < 0 ? 1 : -1, event.shiftKey ? 5 : 1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            nudge(1, event.shiftKey ? 5 : 1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-1, event.shiftKey ? 5 : 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            onChange?.(clampToAxis(min, axis));
          } else if (event.key === "End") {
            event.preventDefault();
            onChange?.(clampToAxis(max, axis));
          } else if (event.key === "0") {
            event.preventDefault();
            onChange?.(normalizeAxisValue(defaultValue, axis));
          }
        }}
        aria-label={`${axis.tag} control`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={safeValue}
        role="slider"
      >
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <path
            d={arcPath(48, 48, 34, -135, 135)}
            fill="none"
            stroke="#d1d5db"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d={arcPath(48, 48, 34, -135, angle)}
            fill="none"
            stroke="#334155"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="48" cy="48" r="27" fill="#f8fafc" stroke="#cbd5e1" />
          {(() => {
            const marker = toPolar(48, 48, 26, angle);
            return <circle cx={marker.x} cy={marker.y} r="4" fill="#334155" />;
          })()}
          <text
            x="48"
            y="51"
            textAnchor="middle"
            fontSize="11"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
            fill="#0f172a"
          >
            {safeValue}
          </text>
        </svg>
      </button>

      <div className="rgfc-knob-meta">
        <div className="rgfc-knob-tag">{axis.tag}</div>
        <button type="button" className="rgfc-knob-reset" onClick={onReset}>
          reset
        </button>
      </div>
    </div>
  );
}
