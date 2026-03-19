"use client";

import { useEffect, useRef } from "react";

const SEGMENTS = 24;
const MAJOR_RADIUS = 104;
const MINOR_RADIUS = 44;
const CAMERA_DISTANCE = 420;
const EDGE_COLOR = "#4bf7ff";
const FALLBACK_BACKGROUND = "#1b1f52";
const BASE_COLOR = { r: 236, g: 103, b: 41 };
const SCROLLER_TEXT =
  "RAGBAZ - standing on the shoulders of giants and bending spoons since 1987";

const basePoints = Array.from({ length: SEGMENTS }, (_, i) => {
  const phi = (i / SEGMENTS) * Math.PI * 2;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  return Array.from({ length: SEGMENTS }, (_, j) => {
    const theta = (j / SEGMENTS) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    return {
      x: (MAJOR_RADIUS + MINOR_RADIUS * cosTheta) * cosPhi,
      y: MINOR_RADIUS * sinTheta,
      z: (MAJOR_RADIUS + MINOR_RADIUS * cosTheta) * sinPhi,
    };
  });
});

function projectPoint(point, rotationX, rotationY, rotationZ, width, height) {
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);

  let x = point.x;
  let y = point.y;
  let z = point.z;

  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  const x2 = x * cosY - z1 * sinY;
  const z2 = x * sinY + z1 * cosY;
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;

  const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - z2);
  return {
    x: width / 2 + x3 * perspective,
    y: height / 2 + y3 * perspective,
    z: z2,
  };
}

export default function TorusBanner() {
  const canvasRef = useRef(null);
  const scrollerChars = Array.from(`${SCROLLER_TEXT}     `);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frameId;

    function draw(time) {
      if (!canvas || !ctx) return;
      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 260;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const root = canvas.closest(".admin-layout");
      const torusBackground =
        getComputedStyle(root || document.documentElement)
          .getPropertyValue("--admin-torus-bg")
          .trim() || FALLBACK_BACKGROUND;
      ctx.fillStyle = torusBackground;
      ctx.fillRect(0, 0, width, height);

      const rotationY = time * 0.00052;
      const rotationX = Math.sin(time * 0.00084) * 0.38 + 0.5;
      const rotationZ = Math.cos(time * 0.00068) * 0.42;

      const projected = basePoints.map((ring) =>
        ring.map((point) =>
          projectPoint(point, rotationX, rotationY, rotationZ, width, height),
        ),
      );

      const faces = [];
      for (let i = 0; i < SEGMENTS; i += 1) {
        const nextI = (i + 1) % SEGMENTS;
        for (let j = 0; j < SEGMENTS; j += 1) {
          const nextJ = (j + 1) % SEGMENTS;
          const a = projected[i][j];
          const b = projected[nextI][j];
          const c = projected[nextI][nextJ];
          const d = projected[i][nextJ];
          const avgZ = (a.z + b.z + c.z + d.z) / 4;
          faces.push({ verts: [a, b, c, d], z: avgZ });
        }
      }

      faces.sort((a, b) => a.z - b.z);

      faces.forEach((face) => {
        const normalized = Math.max(
          0,
          Math.min(1, (face.z + MAJOR_RADIUS) / (MAJOR_RADIUS * 2)),
        );
        const brightness = 0.78 + 0.26 * (1 - normalized);
        const r = Math.floor(BASE_COLOR.r * brightness);
        const g = Math.floor(BASE_COLOR.g * brightness);
        const b = Math.floor(BASE_COLOR.b * brightness);
        ctx.beginPath();
        face.verts.forEach((vert, index) => {
          if (index === 0) {
            ctx.moveTo(vert.x, vert.y);
          } else {
            ctx.lineTo(vert.x, vert.y);
          }
        });
        ctx.closePath();
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        ctx.strokeStyle = EDGE_COLOR;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      });

      frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-cyan-400/35 bg-transparent overflow-hidden">
      <div className="grid items-center gap-4 p-3 sm:p-4 md:grid-cols-[minmax(300px,420px)_1fr]">
        <div className="rounded-xl border border-cyan-400/45 bg-[var(--admin-torus-bg)] shadow-[inset_0_0_0_1px_rgba(75,247,255,0.2)]">
          <canvas
            ref={canvasRef}
            className="block w-full h-64 sm:h-72 opacity-95"
            aria-hidden
          />
        </div>
        <div className="min-h-[15rem] flex items-center overflow-hidden px-1 sm:px-2">
          <div className="torus-scroller-viewport">
            <div className="torus-scroller-track">
              {[0, 1, 2].map((segment) => (
                <span key={segment} className="torus-scroller-segment" aria-hidden>
                  {scrollerChars.map((char, index) => (
                    <span
                      key={`${segment}-${index}`}
                      className="torus-wave-char"
                      style={{ animationDelay: `${(index % 28) * 0.055}s` }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .torus-scroller-viewport {
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }

        .torus-scroller-track {
          display: inline-flex;
          min-width: max-content;
          animation: torus-scroll 22s linear infinite;
        }

        .torus-scroller-segment {
          display: inline-flex;
          margin-right: 2.4rem;
          font-size: clamp(0.95rem, 2.2vw, 1.6rem);
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #111827;
        }

        .torus-wave-char {
          display: inline-block;
          animation: torus-wave 1.75s ease-in-out infinite;
          will-change: transform;
        }

        @keyframes torus-scroll {
          from {
            transform: translateX(0%);
          }
          to {
            transform: translateX(-33.333%);
          }
        }

        @keyframes torus-wave {
          0%,
          100% {
            transform: translateY(0);
          }
          25% {
            transform: translateY(-8px);
          }
          75% {
            transform: translateY(8px);
          }
        }
      `}</style>
    </div>
  );
}
