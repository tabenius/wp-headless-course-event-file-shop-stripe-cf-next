"use client";

import { useEffect, useRef } from "react";

const SEGMENTS = 24;
const MAJOR_RADIUS = 104;
const MINOR_RADIUS = 44;
const TREFOIL_SCALE_XY = 36;
const TREFOIL_SCALE_Y = 31;
const TREFOIL_SCALE_Z = 58;
const TREFOIL_TUBE_RADIUS = 18;
const CAMERA_DISTANCE = 420;
const EDGE_COLOR = "#4bf7ff";
const BASE_COLOR = { r: 236, g: 103, b: 41 };
const SCROLLER_TEXT =
  "RAGBAZ - standing on the shoulders of giants and bending spoons since 1987";
const ENABLE_SINE_SCROLLER = false;
const ENABLE_TREFOIL_KNOT = true;

const L_SYSTEM_RULES = {
  F: "FF-[-F+F+F]+[+F-F-F]",
};

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

function expandLSystem(axiom, rules, iterations) {
  let output = axiom;
  for (let i = 0; i < iterations; i += 1) {
    let next = "";
    for (const token of output) {
      next += rules[token] || token;
    }
    output = next;
  }
  return output;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function traceLSystemPlant({
  commands,
  startX,
  startY,
  startAngle,
  stepBase,
  turnBase,
  leafSizeBase,
  rand,
}) {
  let x = startX;
  let y = startY;
  let angle = startAngle;
  const stack = [];
  let branches = "";
  let leaves = "";

  for (let i = 0; i < commands.length; i += 1) {
    const token = commands[i];
    if (token === "F") {
      const len = stepBase * (0.84 + rand() * 0.34);
      const rad = degToRad(angle);
      const nx = x + Math.cos(rad) * len;
      const ny = y + Math.sin(rad) * len;
      branches += `M${x.toFixed(2)} ${y.toFixed(2)}L${nx.toFixed(2)} ${ny.toFixed(2)}`;

      if (stack.length > 1 && (i % 3 === 0 || rand() > 0.74)) {
        const leafLen = leafSizeBase * (0.72 + rand() * 0.62);
        const leftAngle = rad + 2.34;
        const rightAngle = rad - 2.34;
        const lx = nx + Math.cos(leftAngle) * leafLen;
        const ly = ny + Math.sin(leftAngle) * leafLen;
        const rx = nx + Math.cos(rightAngle) * leafLen;
        const ry = ny + Math.sin(rightAngle) * leafLen;
        leaves += `M${nx.toFixed(2)} ${ny.toFixed(2)}L${lx.toFixed(2)} ${ly.toFixed(2)}M${nx.toFixed(2)} ${ny.toFixed(2)}L${rx.toFixed(2)} ${ry.toFixed(2)}`;
      }

      x = nx;
      y = ny;
      continue;
    }

    if (token === "+") {
      angle += turnBase * (0.82 + rand() * 0.36);
      continue;
    }
    if (token === "-") {
      angle -= turnBase * (0.82 + rand() * 0.36);
      continue;
    }
    if (token === "[") {
      stack.push({ x, y, angle });
      continue;
    }
    if (token === "]") {
      const prev = stack.pop();
      if (prev) {
        x = prev.x;
        y = prev.y;
        angle = prev.angle;
      }
    }
  }

  return { branches, leaves };
}

function buildLeafBushLayerDataUri({
  seed,
  width,
  height,
  plantCount,
  iterations,
  stepBase,
  turnBase,
  leafSizeBase,
  branchColor,
  leafColor,
  branchWidth,
  leafWidth,
  branchOpacity,
  leafOpacity,
}) {
  const rand = mulberry32(seed);
  const commands = expandLSystem("F", L_SYSTEM_RULES, iterations);
  let branches = "";
  let leaves = "";

  for (let i = 0; i < plantCount; i += 1) {
    const progress = i / Math.max(1, plantCount - 1);
    const jitter = (rand() - 0.5) * (width / plantCount) * 0.7;
    const startX = progress * width + jitter;
    const startY = height * (0.9 + rand() * 0.07);
    const startAngle = -90 + (rand() - 0.5) * 20;
    const traced = traceLSystemPlant({
      commands,
      startX,
      startY,
      startAngle,
      stepBase: stepBase * (0.86 + rand() * 0.3),
      turnBase: turnBase * (0.9 + rand() * 0.22),
      leafSizeBase: leafSizeBase * (0.9 + rand() * 0.35),
      rand,
    });
    branches += traced.branches;
    leaves += traced.leaves;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g fill="none" stroke="${branchColor}" stroke-width="${branchWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${branchOpacity}"><path d="${branches}"/></g><g fill="none" stroke="${leafColor}" stroke-width="${leafWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${leafOpacity}"><path d="${leaves}"/></g></svg>`;
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

const torusBasePoints = Array.from({ length: SEGMENTS }, (_, i) => {
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

const trefoilBasePoints = Array.from({ length: SEGMENTS }, (_, i) => {
  const t = (i / SEGMENTS) * Math.PI * 2;
  const center = {
    x: TREFOIL_SCALE_XY * (Math.sin(t) + 2 * Math.sin(2 * t)),
    y: TREFOIL_SCALE_Y * (Math.cos(t) - 2 * Math.cos(2 * t)),
    z: TREFOIL_SCALE_Z * -Math.sin(3 * t),
  };
  const tangent = normalize({
    x: TREFOIL_SCALE_XY * (Math.cos(t) + 4 * Math.cos(2 * t)),
    y: TREFOIL_SCALE_Y * (-Math.sin(t) + 4 * Math.sin(2 * t)),
    z: TREFOIL_SCALE_Z * -3 * Math.cos(3 * t),
  });
  const helper = Math.abs(tangent.y) < 0.88 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const normal = normalize(cross(tangent, helper));
  const binormal = normalize(cross(tangent, normal));

  return Array.from({ length: SEGMENTS }, (_, j) => {
    const theta = (j / SEGMENTS) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    return {
      x:
        center.x +
        TREFOIL_TUBE_RADIUS * (normal.x * cosTheta + binormal.x * sinTheta),
      y:
        center.y +
        TREFOIL_TUBE_RADIUS * (normal.y * cosTheta + binormal.y * sinTheta),
      z:
        center.z +
        TREFOIL_TUBE_RADIUS * (normal.z * cosTheta + binormal.z * sinTheta),
    };
  });
});

const GEOMETRY_DEPTH_RANGE = ENABLE_TREFOIL_KNOT ? 220 : MAJOR_RADIUS * 2;
const activeBasePoints = ENABLE_TREFOIL_KNOT ? trefoilBasePoints : torusBasePoints;

const FAR_BUSH_LAYER_IMAGE = buildLeafBushLayerDataUri({
  seed: 1407,
  width: 1600,
  height: 420,
  plantCount: 16,
  iterations: 2,
  stepBase: 6.4,
  turnBase: 23.5,
  leafSizeBase: 2.9,
  branchColor: "#2a5b2d",
  leafColor: "#5f9644",
  branchWidth: 1.15,
  leafWidth: 0.95,
  branchOpacity: 0.52,
  leafOpacity: 0.46,
});

const MID_BUSH_LAYER_IMAGE = buildLeafBushLayerDataUri({
  seed: 2771,
  width: 1600,
  height: 470,
  plantCount: 21,
  iterations: 3,
  stepBase: 7.2,
  turnBase: 22.2,
  leafSizeBase: 3.5,
  branchColor: "#2f6a30",
  leafColor: "#6cab4c",
  branchWidth: 1.25,
  leafWidth: 1.05,
  branchOpacity: 0.62,
  leafOpacity: 0.57,
});

const NEAR_BUSH_LAYER_IMAGE = buildLeafBushLayerDataUri({
  seed: 3901,
  width: 1600,
  height: 520,
  plantCount: 25,
  iterations: 3,
  stepBase: 7.8,
  turnBase: 21.8,
  leafSizeBase: 3.9,
  branchColor: "#255127",
  leafColor: "#73b152",
  branchWidth: 1.35,
  leafWidth: 1.15,
  branchOpacity: 0.74,
  leafOpacity: 0.68,
});

const FAR_BUSH_STYLE = { "--leafy-bush-layer": FAR_BUSH_LAYER_IMAGE };
const MID_BUSH_STYLE = { "--leafy-bush-layer": MID_BUSH_LAYER_IMAGE };
const NEAR_BUSH_STYLE = { "--leafy-bush-layer": NEAR_BUSH_LAYER_IMAGE };

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
      ctx.clearRect(0, 0, width, height);

      const rotationY = time * 0.00052;
      const rotationX = Math.sin(time * 0.00084) * 0.38 + 0.5;
      const rotationZ = Math.cos(time * 0.00068) * 0.42;

      const projected = activeBasePoints.map((ring) =>
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
          Math.min(1, (face.z + GEOMETRY_DEPTH_RANGE / 2) / GEOMETRY_DEPTH_RANGE),
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
    <div className="-mx-3 sm:-mx-4 lg:-mx-6 relative bg-transparent overflow-hidden">
      <div className="torus-parallax-scene" aria-hidden>
        <div className="torus-parallax-layer torus-parallax-sky" />
        <div
          className="torus-parallax-layer torus-parallax-far-bushes"
          style={FAR_BUSH_STYLE}
        />
        <div
          className="torus-parallax-layer torus-parallax-mid-bushes"
          style={MID_BUSH_STYLE}
        />
        <div
          className="torus-parallax-layer torus-parallax-near-bushes"
          style={NEAR_BUSH_STYLE}
        />
      </div>

      <div className="relative z-[1] grid items-stretch gap-0 md:grid-cols-[minmax(360px,1.05fr)_1fr]">
        <div className="torus-panel-shell min-h-[20rem] sm:min-h-[22rem] md:min-h-[24rem]">
          <canvas
            ref={canvasRef}
            className="block w-full h-full min-h-[20rem] sm:min-h-[22rem] md:min-h-[24rem]"
            aria-hidden
          />
        </div>
        <div className="min-h-[20rem] sm:min-h-[22rem] md:min-h-[24rem] flex items-center overflow-hidden px-3 sm:px-5">
          {ENABLE_SINE_SCROLLER ? (
            <div className="torus-scroller-viewport">
              <div className="torus-scroller-track">
                {[0, 1, 2].map((segment) => (
                  <span
                    key={segment}
                    className="torus-scroller-segment"
                    aria-hidden
                  >
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
          ) : (
            <div className="torus-scroller-muted">{SCROLLER_TEXT}</div>
          )}
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
          inset: -5%;
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
          top: 42%;
          left: -8%;
          right: -8%;
          bottom: -10%;
          opacity: 0.72;
          background-image:
            linear-gradient(
              180deg,
              rgba(36, 87, 40, 0.08) 0%,
              rgba(30, 92, 35, 0.42) 52%,
              rgba(22, 73, 28, 0.64) 100%
            ),
            var(--leafy-bush-layer);
          background-size:
            100% 100%,
            126% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            repeat-x;
          animation-duration: 56s;
          transform: translateX(-2.4%);
        }

        .torus-parallax-mid-bushes {
          top: 50%;
          left: -9%;
          right: -9%;
          bottom: -14%;
          opacity: 0.84;
          background-image:
            linear-gradient(
              180deg,
              rgba(31, 90, 35, 0.06) 0%,
              rgba(26, 87, 32, 0.52) 48%,
              rgba(16, 58, 24, 0.82) 100%
            ),
            var(--leafy-bush-layer);
          background-size:
            100% 100%,
            132% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            repeat-x;
          animation-duration: 44s;
          animation-direction: reverse;
          transform: translateX(2.8%);
        }

        .torus-parallax-near-bushes {
          top: 58%;
          left: -10%;
          right: -10%;
          bottom: -20%;
          opacity: 0.96;
          background-image:
            linear-gradient(
              180deg,
              rgba(24, 74, 29, 0.02) 0%,
              rgba(16, 58, 24, 0.63) 43%,
              rgba(8, 34, 16, 0.92) 100%
            ),
            var(--leafy-bush-layer);
          background-size:
            100% 100%,
            138% 100%;
          background-position:
            center bottom,
            center bottom;
          background-repeat:
            no-repeat,
            repeat-x;
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
          color: var(--admin-torus-scroller-color, #111827);
          text-shadow:
            0 0 8px rgba(0, 0, 0, 0.25),
            0 1px 0 rgba(0, 0, 0, 0.55);
        }

        .torus-wave-char {
          display: inline-block;
          animation: torus-wave 1.75s ease-in-out infinite;
          will-change: transform;
        }

        .torus-scroller-muted {
          color: var(--admin-torus-scroller-color, #111827);
          font-size: clamp(0.95rem, 2.1vw, 1.45rem);
          font-weight: 700;
          letter-spacing: 0.03em;
          text-shadow:
            0 0 8px rgba(0, 0, 0, 0.25),
            0 1px 0 rgba(0, 0, 0, 0.55);
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
