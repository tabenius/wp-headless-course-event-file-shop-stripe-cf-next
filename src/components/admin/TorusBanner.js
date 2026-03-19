"use client";

import { useEffect, useRef } from "react";

const TORUS_MAJOR_SEGMENTS = 64;
const TORUS_MINOR_SEGMENTS = 64;
const TORUS_MAJOR_RADIUS = 118;
const TORUS_MINOR_RADIUS = 42;
const TORUS_DEPTH_RANGE = (TORUS_MAJOR_RADIUS + TORUS_MINOR_RADIUS) * 2;
const CAMERA_DISTANCE = 420;
const EDGE_COLOR = "#4bf7ff";
const BASE_COLOR = { r: 236, g: 103, b: 41 };

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushSierpinskiTriangles(tris, ax, ay, bx, by, cx, cy, depth) {
  if (depth <= 0) {
    tris.push([ax, ay, bx, by, cx, cy]);
    return;
  }
  const abx = (ax + bx) / 2;
  const aby = (ay + by) / 2;
  const bcx = (bx + cx) / 2;
  const bcy = (by + cy) / 2;
  const cax = (cx + ax) / 2;
  const cay = (cy + ay) / 2;
  pushSierpinskiTriangles(tris, ax, ay, abx, aby, cax, cay, depth - 1);
  pushSierpinskiTriangles(tris, abx, aby, bx, by, bcx, bcy, depth - 1);
  pushSierpinskiTriangles(tris, cax, cay, bcx, bcy, cx, cy, depth - 1);
}

function buildSierpinskiForestLayerDataUri({
  seed,
  width,
  height,
  treeCount,
  minSize,
  maxSize,
  minDepth,
  maxDepth,
  palette,
  strokeColor,
  strokeWidth,
  fillOpacity,
}) {
  const rand = mulberry32(seed);
  const depthSpan = Math.max(1, maxDepth - minDepth + 1);
  const polygons = [];

  for (let i = 0; i < treeCount; i += 1) {
    const progress = (i + 0.5) / treeCount;
    const jitter = (rand() - 0.5) * (width / treeCount) * 0.6;
    const x = progress * width + jitter;
    const y = height * (0.88 + rand() * 0.08);
    const size = minSize + rand() * (maxSize - minSize);
    const depth = minDepth + Math.floor(rand() * depthSpan);
    const ax = x;
    const ay = y - size;
    const bx = x - size * 0.58;
    const by = y;
    const cx = x + size * 0.58;
    const cy = y;
    const tris = [];
    pushSierpinskiTriangles(tris, ax, ay, bx, by, cx, cy, depth);

    for (let t = 0; t < tris.length; t += 1) {
      const tri = tris[t];
      const color = palette[(i + t) % palette.length];
      polygons.push(
        `<polygon points="${tri[0].toFixed(2)},${tri[1].toFixed(2)} ${tri[2].toFixed(2)},${tri[3].toFixed(2)} ${tri[4].toFixed(2)},${tri[5].toFixed(2)}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${polygons.join("")}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

const torusBasePoints = Array.from({ length: TORUS_MAJOR_SEGMENTS }, (_, i) => {
  const majorAngle = (i / TORUS_MAJOR_SEGMENTS) * Math.PI * 2;
  const cosMajor = Math.cos(majorAngle);
  const sinMajor = Math.sin(majorAngle);
  return Array.from({ length: TORUS_MINOR_SEGMENTS }, (_, j) => {
    const minorAngle = (j / TORUS_MINOR_SEGMENTS) * Math.PI * 2;
    const cosMinor = Math.cos(minorAngle);
    const sinMinor = Math.sin(minorAngle);
    const ringRadius = TORUS_MAJOR_RADIUS + TORUS_MINOR_RADIUS * cosMinor;
    return {
      x: ringRadius * cosMajor,
      y: TORUS_MINOR_RADIUS * sinMinor,
      z: ringRadius * sinMajor,
    };
  });
});

const FAR_TREE_LAYER_IMAGE = buildSierpinskiForestLayerDataUri({
  seed: 1407,
  width: 1600,
  height: 420,
  treeCount: 7,
  minSize: 84,
  maxSize: 160,
  minDepth: 2,
  maxDepth: 3,
  palette: ["#22ffea", "#ff2cab", "#ffe300", "#5dff3a"],
  strokeColor: "#080d1a",
  strokeWidth: 1.05,
  fillOpacity: 0.95,
});

const MID_TREE_LAYER_IMAGE = buildSierpinskiForestLayerDataUri({
  seed: 2771,
  width: 1600,
  height: 470,
  treeCount: 9,
  minSize: 108,
  maxSize: 210,
  minDepth: 3,
  maxDepth: 3,
  palette: ["#6dff00", "#a700ff", "#ff3d00", "#00b8ff"],
  strokeColor: "#060812",
  strokeWidth: 1.2,
  fillOpacity: 0.96,
});

const NEAR_TREE_LAYER_IMAGE = buildSierpinskiForestLayerDataUri({
  seed: 3901,
  width: 1600,
  height: 520,
  treeCount: 11,
  minSize: 130,
  maxSize: 250,
  minDepth: 3,
  maxDepth: 4,
  palette: ["#00ffa6", "#ff006f", "#00a2ff", "#ffd000", "#ad00ff"],
  strokeColor: "#03050b",
  strokeWidth: 1.35,
  fillOpacity: 0.97,
});

const FAR_TREE_STYLE = { "--fractal-tree-layer": FAR_TREE_LAYER_IMAGE };
const MID_TREE_STYLE = { "--fractal-tree-layer": MID_TREE_LAYER_IMAGE };
const NEAR_TREE_STYLE = { "--fractal-tree-layer": NEAR_TREE_LAYER_IMAGE };

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
    vx: x3,
    vy: y3,
    vz: z2,
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
      const height = canvas.clientHeight || 130;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const rotationY = time * 0.00052;
      const rotationX = Math.sin(time * 0.00084) * 0.38 + 0.5;
      const rotationZ = Math.cos(time * 0.00068) * 0.42;

      const projected = torusBasePoints.map((ring) =>
        ring.map((point) =>
          projectPoint(point, rotationX, rotationY, rotationZ, width, height),
        ),
      );

      const faces = [];
      const lightDir = normalize({ x: 0.35, y: -0.24, z: 0.9 });

      for (let i = 0; i < TORUS_MAJOR_SEGMENTS; i += 1) {
        const nextI = (i + 1) % TORUS_MAJOR_SEGMENTS;
        for (let j = 0; j < TORUS_MINOR_SEGMENTS; j += 1) {
          const nextJ = (j + 1) % TORUS_MINOR_SEGMENTS;
          const a = projected[i][j];
          const b = projected[nextI][j];
          const c = projected[nextI][nextJ];
          const d = projected[i][nextJ];

          const edge1 = {
            x: b.vx - a.vx,
            y: b.vy - a.vy,
            z: b.vz - a.vz,
          };
          const edge2 = {
            x: d.vx - a.vx,
            y: d.vy - a.vy,
            z: d.vz - a.vz,
          };
          const normal = normalize(cross(edge1, edge2));
          const centroid = {
            x: (a.vx + b.vx + c.vx + d.vx) / 4,
            y: (a.vy + b.vy + c.vy + d.vy) / 4,
            z: (a.vz + b.vz + c.vz + d.vz) / 4,
          };
          const toCamera = normalize({
            x: -centroid.x,
            y: -centroid.y,
            z: CAMERA_DISTANCE - centroid.z,
          });
          const facing =
            normal.x * toCamera.x +
            normal.y * toCamera.y +
            normal.z * toCamera.z;
          if (facing <= 0) continue;

          const lambert = Math.max(
            0.12,
            normal.x * lightDir.x +
              normal.y * lightDir.y +
              normal.z * lightDir.z,
          );
          faces.push({
            verts: [a, b, c, d],
            z: (a.z + b.z + c.z + d.z) / 4,
            lambert,
            facing,
          });
        }
      }

      faces.sort((a, b) => a.z - b.z);

      faces.forEach((face) => {
        const normalized = Math.max(
          0,
          Math.min(1, (face.z + TORUS_DEPTH_RANGE / 2) / TORUS_DEPTH_RANGE),
        );
        const depthBoost = 1 - normalized;
        const brightness =
          0.44 + 0.38 * face.lambert + 0.16 * depthBoost + 0.08 * face.facing;
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
        const alpha = 0.9 + 0.07 * normalized;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
        const edgeAlpha = 0.16 + 0.16 * depthBoost + 0.1 * face.facing;
        ctx.strokeStyle = `rgba(75, 247, 255, ${edgeAlpha})`;
        ctx.lineWidth = 0.45;
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
    <div className="-mx-3 sm:-mx-4 lg:-mx-6 relative bg-transparent overflow-hidden">
      <div className="torus-parallax-scene" aria-hidden>
        <div className="torus-parallax-layer torus-parallax-sky" />
        <div
          className="torus-parallax-layer torus-parallax-far-bushes"
          style={FAR_TREE_STYLE}
        />
        <div
          className="torus-parallax-layer torus-parallax-mid-bushes"
          style={MID_TREE_STYLE}
        />
        <div
          className="torus-parallax-layer torus-parallax-near-bushes"
          style={NEAR_TREE_STYLE}
        />
      </div>

      <div className="relative z-[1]">
        <div className="torus-panel-shell min-h-[10rem] sm:min-h-[11rem] md:min-h-[12rem]">
          <canvas
            ref={canvasRef}
            className="block w-full h-full min-h-[10rem] sm:min-h-[11rem] md:min-h-[12rem]"
            aria-hidden
          />
        </div>
      </div>
      <style jsx>{`
        .torus-parallax-scene {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .torus-parallax-layer {
          position: absolute;
          inset: -18%;
          transform-origin: 50% 100%;
          animation-name: pendulum-sway;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        .torus-parallax-sky {
          inset: 0;
          background:
            radial-gradient(
              46% 40% at 74% 86%,
              rgba(255, 52, 34, 0.88) 0%,
              rgba(255, 84, 36, 0.64) 34%,
              rgba(230, 36, 28, 0.26) 56%,
              transparent 72%
            ),
            linear-gradient(
              180deg,
              rgba(31, 41, 68, 0.7) 0%,
              rgba(73, 52, 76, 0.56) 34%,
              rgba(175, 68, 45, 0.43) 64%,
              rgba(196, 74, 43, 0.5) 74%,
              rgba(95, 86, 63, 0.36) 100%
            );
          animation-duration: 68s;
        }

        .torus-parallax-far-bushes {
          top: 22%;
          left: -20%;
          right: -20%;
          bottom: -10%;
          opacity: 0.94;
          background-image:
            linear-gradient(
              180deg,
              rgba(12, 19, 42, 0.04) 0%,
              rgba(18, 24, 56, 0.32) 54%,
              rgba(14, 17, 44, 0.58) 100%
            ),
            var(--fractal-tree-layer);
          background-size:
            100% 100%,
            170% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            no-repeat;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
          mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
          animation-duration: 56s;
          transform: translateX(-2.4%);
        }

        .torus-parallax-mid-bushes {
          top: 29%;
          left: -20%;
          right: -20%;
          bottom: -14%;
          opacity: 0.97;
          background-image:
            linear-gradient(
              180deg,
              rgba(16, 11, 44, 0.02) 0%,
              rgba(19, 12, 56, 0.34) 46%,
              rgba(9, 7, 40, 0.64) 100%
            ),
            var(--fractal-tree-layer);
          background-size:
            100% 100%,
            180% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            no-repeat;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 9%,
            #000 91%,
            transparent 100%
          );
          mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 9%,
            #000 91%,
            transparent 100%
          );
          animation-duration: 44s;
          animation-direction: reverse;
          transform: translateX(2.8%);
        }

        .torus-parallax-near-bushes {
          top: 38%;
          left: -20%;
          right: -20%;
          bottom: -20%;
          opacity: 1;
          background-image:
            linear-gradient(
              180deg,
              rgba(24, 12, 28, 0) 0%,
              rgba(36, 10, 38, 0.4) 41%,
              rgba(16, 6, 22, 0.72) 100%
            ),
            var(--fractal-tree-layer);
          background-size:
            100% 100%,
            190% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            no-repeat;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 10%,
            #000 90%,
            transparent 100%
          );
          mask-image: linear-gradient(
            90deg,
            transparent 0%,
            #000 10%,
            #000 90%,
            transparent 100%
          );
          animation-duration: 34s;
          transform: translateX(-3.6%);
        }

        @keyframes pendulum-sway {
          0% {
            transform: translateX(-2.4%) rotate(-0.7deg);
          }
          50% {
            transform: translateX(2.4%) rotate(0.7deg);
          }
          100% {
            transform: translateX(-2.4%) rotate(-0.7deg);
          }
        }

        .torus-panel-shell {
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          outline: none !important;
        }

        .torus-panel-shell canvas {
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}
