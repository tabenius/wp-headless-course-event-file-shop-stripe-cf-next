"use client";

import { useEffect, useRef } from "react";
import RagbazLogo from "./RagbazLogo";

const SEGMENTS = 24;
const MAJOR_RADIUS = 110;
const MINOR_RADIUS = 36;
const CAMERA_DISTANCE = 420;
const EDGE_COLOR = "#4bf7ff";
const BACKGROUND_COLOR = "#050a17";
const BASE_COLOR = { r: 186, g: 65, b: 22 };

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
      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, width, height);

      const rotationY = time * 0.0003;
      const rotationX = Math.sin(time * 0.0005) * 0.35 + 0.45;
      const rotationZ = Math.cos(time * 0.0004) * 0.4;

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
        const brightness = 0.65 + 0.35 * (1 - normalized);
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
    <div className="relative rounded-2xl border border-cyan-400/40 bg-[#050b17] shadow-2xl overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-64 block opacity-80 mix-blend-screen"
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050b17]/40 via-[#050d1d]/30 to-[#040712]/80" />
      <div className="relative z-20 px-6 py-5 space-y-1 text-white">
        <div className="flex items-center justify-between">
          <RagbazLogo color="#f7fbff" />
          <span className="text-xs uppercase tracking-[0.3em] text-cyan-200">
            Advanced
          </span>
        </div>
        <p className="text-sm text-white/80 max-w-2xl">
          The rotating torus visualizes the tight, engineered geometry of the
          RAGBAZ Articulate StoreFront experience—precise, angular, and with
          cyan edges that trace the workflow depth.
        </p>
      </div>
    </div>
  );
}
