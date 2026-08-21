import { useEffect, useRef } from 'react';

const SPACING = 22;
const DOT_RADIUS = 1.5;
const INFLUENCE_RADIUS = 180;
const SPRING = 0.055;
const DAMPING = 0.11;
const MAGNETISM = 16;
const HOVER_LERP = 0.06;
const POINTER_LERP = 0.14;
const TAU = Math.PI * 2;

export default function MagneticDotsField({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let dots = [];
    let frame;
    let width = 0;
    let height = 0;
    let pointer = null;
    let smoothX = -99999;
    let smoothY = -99999;
    let hoverStrength = 0;
    let dark = document.documentElement.classList.contains('dark');

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const previous = new Map(dots.map((dot) => [`${dot.column}:${dot.row}`, dot]));
      const columns = Math.ceil(width / SPACING) + 1;
      const rows = Math.ceil(height / SPACING) + 1;
      const offsetX = (width % SPACING) / 2;
      const offsetY = (height % SPACING) / 2;
      dots = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const restX = offsetX + column * SPACING;
          const restY = offsetY + row * SPACING;
          const old = previous.get(`${column}:${row}`);
          dots.push(old
            ? { ...old, restX, restY }
            : { column, row, restX, restY, x: restX, y: restY, vx: 0, vy: 0 });
        }
      }
    };

    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const leave = () => { pointer = null; };

    const draw = () => {
      const targetStrength = pointer ? 1 : 0;
      hoverStrength += (targetStrength - hoverStrength) * HOVER_LERP;
      if (pointer) {
        if (smoothX === -99999) {
          smoothX = pointer.x;
          smoothY = pointer.y;
        }
        smoothX += (pointer.x - smoothX) * POINTER_LERP;
        smoothY += (pointer.y - smoothY) * POINTER_LERP;
      } else {
        smoothX = -99999;
        smoothY = -99999;
      }

      ctx.fillStyle = dark ? '#110f0c' : '#f5f1ea';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = dark ? 'rgba(255,255,255,.5)' : 'rgba(28,25,22,.4)';
      const influenceSquared = INFLUENCE_RADIUS * INFLUENCE_RADIUS;

      dots.forEach((dot) => {
        if (hoverStrength > 0.001) {
          const dx = dot.x - smoothX;
          const dy = dot.y - smoothY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < influenceSquared && distanceSquared > 0.01) {
            const distance = Math.sqrt(distanceSquared);
            const falloff = 1 - distance / INFLUENCE_RADIUS;
            const force = falloff * falloff * MAGNETISM * hoverStrength;
            dot.vx += (-dx / distance) * force;
            dot.vy += (-dy / distance) * force;
          }
        }
        dot.vx += (dot.restX - dot.x) * SPRING;
        dot.vy += (dot.restY - dot.y) * SPRING;
        dot.vx *= 1 - DAMPING;
        dot.vy *= 1 - DAMPING;
        dot.x += dot.vx;
        dot.y += dot.vy;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, TAU);
        ctx.fill();
      });
      frame = requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(build);
    const themeObserver = new MutationObserver(() => {
      dark = document.documentElement.classList.contains('dark');
    });
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

  return <canvas className="particle-field interactive-field interactive-field-magnetic" ref={canvasRef} aria-hidden="true" />;
}
