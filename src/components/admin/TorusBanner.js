"use client";

import { useEffect, useRef } from "react";

const CURVE_SEGMENTS = 120;
const RING_SEGMENTS = 30;
const MAJOR_RADIUS = 104;
const MINOR_RADIUS = 44;
const TREFOIL_SCALE_XY = 44;
const TREFOIL_SCALE_Y = 38;
const TREFOIL_SCALE_Z = 70;
const TREFOIL_TUBE_RADIUS = 14;
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
  outlineColor,
  branchWidth,
  leafWidth,
  branchOutlineWidth,
  leafOutlineWidth,
  branchOpacity,
  leafOpacity,
  outlineOpacity,
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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g fill="none" stroke="${outlineColor}" stroke-width="${branchWidth + branchOutlineWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${outlineOpacity}"><path d="${branches}"/></g><g fill="none" stroke="${outlineColor}" stroke-width="${leafWidth + leafOutlineWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${outlineOpacity}"><path d="${leaves}"/></g><g fill="none" stroke="${branchColor}" stroke-width="${branchWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${branchOpacity}"><path d="${branches}"/></g><g fill="none" stroke="${leafColor}" stroke-width="${leafWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${leafOpacity}"><path d="${leaves}"/></g></svg>`;
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

const torusBasePoints = Array.from({ length: CURVE_SEGMENTS }, (_, i) => {
  const phi = (i / CURVE_SEGMENTS) * Math.PI * 2;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  return Array.from({ length: RING_SEGMENTS }, (_, j) => {
    const theta = (j / RING_SEGMENTS) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    return {
      x: (MAJOR_RADIUS + MINOR_RADIUS * cosTheta) * cosPhi,
      y: MINOR_RADIUS * sinTheta,
      z: (MAJOR_RADIUS + MINOR_RADIUS * cosTheta) * sinPhi,
    };
  });
});

const trefoilBasePoints = Array.from({ length: CURVE_SEGMENTS }, (_, i) => {
  const t = (i / CURVE_SEGMENTS) * Math.PI * 2;
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

  return Array.from({ length: RING_SEGMENTS }, (_, j) => {
    const theta = (j / RING_SEGMENTS) * Math.PI * 2;
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

const GEOMETRY_DEPTH_RANGE = ENABLE_TREFOIL_KNOT ? 300 : MAJOR_RADIUS * 2;
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
  outlineColor: "#0a1509",
  branchWidth: 1.15,
  leafWidth: 0.95,
  branchOutlineWidth: 0.95,
  leafOutlineWidth: 0.8,
  branchOpacity: 0.88,
  leafOpacity: 0.82,
  outlineOpacity: 0.78,
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
  outlineColor: "#081308",
  branchWidth: 1.25,
  leafWidth: 1.05,
  branchOutlineWidth: 1.05,
  leafOutlineWidth: 0.85,
  branchOpacity: 0.91,
  leafOpacity: 0.87,
  outlineOpacity: 0.82,
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
  outlineColor: "#050d05",
  branchWidth: 1.35,
  leafWidth: 1.15,
  branchOutlineWidth: 1.15,
  leafOutlineWidth: 0.95,
  branchOpacity: 0.94,
  leafOpacity: 0.9,
  outlineOpacity: 0.86,
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
    vx: x3,
    vy: y3,
    vz: z2,
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
      const centerline = projected.map((ring) => {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let j = 0; j < RING_SEGMENTS; j += 1) {
          sx += ring[j].x;
          sy += ring[j].y;
          sz += ring[j].z;
        }
        const inv = 1 / RING_SEGMENTS;
        return { x: sx * inv, y: sy * inv, z: sz * inv };
      });
      const lightDir = normalize({ x: 0.34, y: -0.22, z: 0.91 });

      function pushTriangle(v1, v2, v3) {
        const edge1 = {
          x: v2.vx - v1.vx,
          y: v2.vy - v1.vy,
          z: v2.vz - v1.vz,
        };
        const edge2 = {
          x: v3.vx - v1.vx,
          y: v3.vy - v1.vy,
          z: v3.vz - v1.vz,
        };
        const normal = normalize(cross(edge1, edge2));
        const lambert = Math.max(
          0.08,
          normal.x * lightDir.x +
            normal.y * lightDir.y +
            Math.abs(normal.z) * lightDir.z,
        );
        faces.push({
          verts: [v1, v2, v3],
          z: (v1.z + v2.z + v3.z) / 3,
          lambert,
        });
      }

      for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
        const nextI = (i + 1) % CURVE_SEGMENTS;
        for (let j = 0; j < RING_SEGMENTS; j += 1) {
          const nextJ = (j + 1) % RING_SEGMENTS;
          const a = projected[i][j];
          const b = projected[nextI][j];
          const c = projected[nextI][nextJ];
          const d = projected[i][nextJ];
          pushTriangle(a, b, c);
          pushTriangle(a, c, d);
        }
      }

      faces.sort((a, b) => a.z - b.z);
      const ropeSegments = [];
      for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
        const nextI = (i + 1) % CURVE_SEGMENTS;
        const a = centerline[i];
        const b = centerline[nextI];
        ropeSegments.push({ a, b, z: (a.z + b.z) / 2 });
      }
      ropeSegments.sort((a, b) => a.z - b.z);

      faces.forEach((face) => {
        const normalized = Math.max(
          0,
          Math.min(1, (face.z + GEOMETRY_DEPTH_RANGE / 2) / GEOMETRY_DEPTH_RANGE),
        );
        const depthBoost = 1 - normalized;
        const brightness = 0.48 + 0.42 * face.lambert + 0.18 * depthBoost;
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
        const alpha = 0.9 + 0.08 * normalized;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
        const edgeAlpha = 0.08 + 0.12 * depthBoost;
        ctx.strokeStyle = `rgba(75, 247, 255, ${edgeAlpha})`;
        ctx.lineWidth = 0.26;
        ctx.stroke();
      });

      ropeSegments.forEach((segment) => {
        const normalized = Math.max(
          0,
          Math.min(
            1,
            (segment.z + GEOMETRY_DEPTH_RANGE / 2) / GEOMETRY_DEPTH_RANGE,
          ),
        );
        ctx.beginPath();
        ctx.moveTo(segment.a.x, segment.a.y);
        ctx.lineTo(segment.b.x, segment.b.y);
        ctx.strokeStyle = `rgba(75, 247, 255, ${0.1 + normalized * 0.28})`;
        ctx.lineWidth = 0.82 + normalized * 0.58;
        ctx.lineCap = "round";
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
          ) : null}
        </div>
      </div>
      {!ENABLE_SINE_SCROLLER && (
        <div className="torus-bottom-ticker-shell" aria-hidden>
          <div className="torus-bottom-ticker-viewport">
            <div className="torus-bottom-ticker-track">
              {[0, 1, 2, 3].map((segment) => (
                <span key={`bottom-${segment}`} className="torus-bottom-ticker-segment">
                  {SCROLLER_TEXT}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
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
          opacity: 0.9;
          background-image:
            linear-gradient(
              180deg,
              rgba(34, 90, 37, 0.02) 0%,
              rgba(28, 90, 33, 0.24) 52%,
              rgba(20, 69, 25, 0.42) 100%
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
          opacity: 0.96;
          background-image:
            linear-gradient(
              180deg,
              rgba(28, 90, 33, 0.01) 0%,
              rgba(24, 84, 31, 0.28) 48%,
              rgba(14, 54, 22, 0.58) 100%
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
          opacity: 1;
          background-image:
            linear-gradient(
              180deg,
              rgba(22, 70, 28, 0) 0%,
              rgba(14, 54, 22, 0.34) 43%,
              rgba(7, 30, 14, 0.7) 100%
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

        .torus-bottom-ticker-shell {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          pointer-events: none;
          padding: 0 0.35rem 0.2rem;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.26) 100%
          );
        }

        .torus-bottom-ticker-viewport {
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }

        .torus-bottom-ticker-track {
          display: inline-flex;
          min-width: max-content;
          animation: torus-bottom-scroll 11s linear infinite;
        }

        .torus-bottom-ticker-segment {
          display: inline-flex;
          margin-right: 2.2rem;
          color: #ffe100;
          font-size: clamp(0.62rem, 1.2vw, 0.9rem);
          font-weight: 700;
          letter-spacing: 0.065em;
          text-transform: uppercase;
          text-shadow:
            0 1px 0 rgba(0, 0, 0, 0.8),
            0 0 6px rgba(0, 0, 0, 0.42);
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

        @keyframes torus-bottom-scroll {
          from {
            transform: translateX(0%);
          }
          to {
            transform: translateX(-25%);
          }
        }
      `}</style>
    </div>
  );
}
