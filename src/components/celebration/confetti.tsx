"use client";

import { useEffect, useRef, type RefObject } from "react";

// 競技用プレートの色（青・黄・緑・赤）とチョークの白で作る紙吹雪
const COLORS = ["#2f63e6", "#f2c230", "#34b46a", "#e5484d", "#8fb0ff", "#eef0ec"];

type Kind = "plate" | "strip" | "chalk";

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  age: number;
  life: number;
};

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function makeParticle(kind: Kind, x: number, y: number, angle: number, speed: number): Particle {
  const heavy = kind === "plate";
  return {
    kind,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: kind === "chalk" ? 0.015 : heavy ? 0.24 : 0.17,
    drag: kind === "chalk" ? 0.94 : heavy ? 0.985 : 0.975,
    size: kind === "chalk" ? random(1, 2.6) : heavy ? random(4.5, 8) : random(4, 7),
    color: kind === "chalk" ? "#eef0ec" : pick(COLORS),
    rotation: random(0, Math.PI * 2),
    spin: random(-0.2, 0.2),
    flip: random(0, Math.PI * 2),
    flipSpeed: random(0.08, 0.22),
    age: 0,
    life: kind === "chalk" ? random(900, 1500) : random(2600, 3400),
  };
}

/**
 * 画面全体に紙吹雪を飛ばす（originRef の要素の中心から1回、画面下の左右から1回）。
 * 「動きを減らす」設定の端末では何もしない。
 */
export function Confetti({ originRef }: { originRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const origin = () => {
      const rect = originRef.current?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: width / 2, y: height * 0.28 };
    };

    const bursts: { at: number; run: () => void }[] = [
      {
        at: 330, // プレートが着地する瞬間
        run: () => {
          const { x, y } = origin();
          for (let i = 0; i < 64; i++) {
            const angle = random(-Math.PI, Math.PI);
            const upward = Math.sin(angle) < 0 ? 1 : 0.55;
            particles.push(makeParticle(i % 3 === 0 ? "strip" : "plate", x, y, angle, random(5, 13) * upward));
          }
          for (let i = 0; i < 34; i++) particles.push(makeParticle("chalk", x, y, random(-Math.PI, Math.PI), random(1, 4.5)));
        },
      },
      {
        at: 620, // 左右の下から打ち上げ
        run: () => {
          const baseY = height * 0.8;
          for (let i = 0; i < 36; i++) {
            const kind: Kind = i % 3 === 0 ? "strip" : "plate";
            particles.push(makeParticle(kind, -10, baseY, (random(-76, -48) * Math.PI) / 180, random(13, 21)));
            particles.push(makeParticle(kind, width + 10, baseY, (random(-132, -104) * Math.PI) / 180, random(13, 21)));
          }
        },
      },
    ];

    let frame = 0;
    let start = 0;
    let last = 0;
    const draw = (p: Particle, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.kind === "chalk") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "plate") {
        // 回転しながら裏返るプレート
        ctx.scale(Math.max(0.12, Math.abs(Math.cos(p.flip))), 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(20, 22, 25, 0.55)";
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.38, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.32, -p.size, p.size * 0.64, p.size * 2);
      }
      ctx.restore();
    };

    const tick = (now: number) => {
      if (!start) {
        start = now;
        last = now;
      }
      const elapsed = now - start;
      while (bursts.length && (bursts[0] as { at: number }).at <= elapsed) bursts.shift()!.run();

      const step = Math.min(2.5, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i] as Particle;
        const drag = Math.pow(p.drag, step);
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.rotation += p.spin * step;
        p.flip += p.flipSpeed * step;
        p.age += step * 16.67;
        if (p.age > p.life || p.y > height + 40) {
          particles.splice(i, 1);
          continue;
        }
        const remaining = 1 - p.age / p.life;
        const alpha = p.kind === "chalk" ? 0.6 * remaining : Math.min(1, remaining * 4);
        draw(p, alpha);
      }
      if (bursts.length || particles.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [originRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 h-full w-full" />;
}
