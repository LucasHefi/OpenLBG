import { useEffect, useRef } from 'react';

const DENSITY = 1 / 120;
const MAXIMUM_DOTS = 3000;
const INFLUENCE_RADIUS = 200;
const NEIGHBOUR_DISTANCE = 35;
const BASE_ALPHA_DARK = 0.16;
const BASE_ALPHA_LIGHT = 0.24;
const PEAK_ALPHA_DARK = 0.9;
const PEAK_ALPHA_LIGHT = 0.76;

export default function GranularSignalField({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let dots = [];
    let pairs = [];
    let pointer = null;
    let dark = document.documentElement.classList.contains('dark');
    let frame;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const count = Math.min(Math.round(width * height * DENSITY), MAXIMUM_DOTS);
      dots = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height, brightness: 0 }));
      const buckets = new Map();
      const distanceSquared = NEIGHBOUR_DISTANCE * NEIGHBOUR_DISTANCE;
      pairs = [];
      dots.forEach((dot) => {
        const cellX = Math.floor(dot.x / NEIGHBOUR_DISTANCE);
        const cellY = Math.floor(dot.y / NEIGHBOUR_DISTANCE);
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            const nearby = buckets.get(`${cellX + offsetX}:${cellY + offsetY}`) || [];
            nearby.forEach((other) => {
              const dx = dot.x - other.x;
              const dy = dot.y - other.y;
              if (dx * dx + dy * dy < distanceSquared) pairs.push([dot, other]);
            });
          }
        }
        const key = `${cellX}:${cellY}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(dot);
      });
    };
    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const leave = () => { pointer = null; };

    const draw = () => {
      ctx.fillStyle = dark ? '#110f0c' : '#f5f1ea';
      ctx.fillRect(0, 0, width, height);
      const pointerX = pointer?.x ?? -99999;
      const pointerY = pointer?.y ?? -99999;
      const radiusSquared = INFLUENCE_RADIUS * INFLUENCE_RADIUS;
      const color = dark ? '255,255,255' : '28,25,22';
      const baseAlpha = dark ? BASE_ALPHA_DARK : BASE_ALPHA_LIGHT;
      const peakAlpha = dark ? PEAK_ALPHA_DARK : PEAK_ALPHA_LIGHT;

      dots.forEach((dot) => {
        const dx = dot.x - pointerX;
        const dy = dot.y - pointerY;
        const distanceSquared = dx * dx + dy * dy;
        const target = distanceSquared < radiusSquared ? Math.exp(-distanceSquared / (radiusSquared * 0.25)) : 0;
        dot.brightness += (target > dot.brightness ? 0.16 : 0.07) * (target - dot.brightness);
        if (dot.brightness < 0.004) dot.brightness = 0;
        const alpha = baseAlpha + (peakAlpha - baseAlpha) * dot.brightness;
        const size = 0.8 + dot.brightness * 0.8;
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fillRect(dot.x - size / 2, dot.y - size / 2, size, size);
      });

      ctx.lineWidth = 0.5;
      pairs.forEach(([first, second]) => {
        if (first.brightness < 0.05 || second.brightness < 0.05) return;
        const alpha = Math.min(first.brightness, second.brightness) * 0.18;
        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.stroke();
      });
      frame = requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(build);
    const themeObserver = new MutationObserver(() => { dark = document.documentElement.classList.contains('dark'); });
    build();
    resizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
    };
  }, [active]);

  return <canvas className="particle-field interactive-field interactive-field-granular" ref={canvasRef} aria-hidden="true" />;
}
