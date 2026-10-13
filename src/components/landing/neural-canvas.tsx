'use client';

import { useEffect, useRef } from 'react';

export type Point3 = { x: number; y: number; z: number };

/** Fibonacci sphere: `n` evenly distributed points on the unit sphere, spiralling top to bottom. */
export function fibonacciSphere(n: number): Point3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
}

/**
 * Rotates unit-sphere points by `yaw` (around Y) then `pitch` (around X) and perspective-projects
 * them onto the canvas. `depth` runs from -1 (facing the viewer) to 1 (far side).
 */
export function projector(yaw: number, pitch: number, cx: number, cy: number, radius: number) {
  const fov = 2.4;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch), sinX = Math.sin(pitch);
  return ({ x, y, z }: Point3) => {
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    const scale = fov / (fov + z2);
    return { sx: cx + x1 * radius * scale, sy: cy + y1 * radius * scale, depth: z2 };
  };
}

/** Sizes the backing store to the CSS box × devicePixelRatio (capped at 2) so lines stay crisp. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

// A 3D "neural globe": particles on a sphere, perspective-projected and
// slowly rotating, with lines between nearby nodes. Vanilla canvas — no deps.
export function NeuralCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const NODE_COUNT = 170;
    const LINK_DISTANCE = 0.62;
    const nodes = fibonacciSphere(NODE_COUNT);

    // Node-to-node distances are constant under rotation, so the link
    // pairs can be computed once instead of every frame.
    const links: { a: number; b: number; alphaBase: number }[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= LINK_DISTANCE) {
          links.push({ a: i, b: j, alphaBase: (1 - dist / LINK_DISTANCE) * 0.35 });
        }
      }
    }

    let width = 0;
    let height = 0;
    const resize = () => {
      ({ width, height } = fitCanvas(canvas, ctx));
    };
    resize();
    window.addEventListener('resize', resize);

    // Pointer parallax — eases toward the cursor.
    let targetTiltX = 0;
    let targetTiltY = 0;
    let tiltX = 0;
    let tiltY = 0;
    const onPointer = (e: PointerEvent) => {
      // Negative so the globe leans toward the cursor.
      targetTiltY = -(e.clientX / window.innerWidth - 0.5) * 0.9;
      targetTiltX = -(e.clientY / window.innerHeight - 0.5) * 0.6;
    };
    window.addEventListener('pointermove', onPointer);

    let angle = 0;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      angle += reduced ? 0 : 0.0022;
      tiltX += (targetTiltX - tiltX) * 0.12;
      tiltY += (targetTiltY - tiltY) * 0.12;

      // Rotate + project every node.
      const project = projector(angle + tiltY, 0.35 + tiltX, width / 2, height / 2, Math.min(width, height) * 0.36);
      const projected = nodes.map(project);

      ctx.lineWidth = 1;
      for (const link of links) {
        const a = projected[link.a];
        const b = projected[link.b];
        // Fade lines on the far side of the globe.
        const facing = 1 - (a.depth + b.depth + 2) / 4;
        const alpha = link.alphaBase * Math.max(0.15, facing);
        ctx.strokeStyle = `rgba(148, 163, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // Nodes — cyan up front, violet in back.
      for (const p of projected) {
        const front = 1 - (p.depth + 1) / 2; // 1 = closest
        const size = 1 + front * 2.2;
        const alpha = 0.25 + front * 0.75;
        ctx.fillStyle =
          front > 0.55
            ? `rgba(103, 232, 249, ${alpha.toFixed(3)})`
            : `rgba(167, 139, 250, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
