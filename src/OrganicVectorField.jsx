import { useEffect, useRef } from 'react';

const GRID_SPACING = 24;
const SHAFT_LENGTH = 8;
const HEAD_SIZE = 4;
const DECAY_DISTANCE = 320;
const FAST_LERP = 0.12;
const MINIMUM_LERP = 0.006;
const IDLE_LERP = 0.01;
const WOBBLE_AMPLITUDE = 0.18;
const WOBBLE_FREQUENCY = 0.7;

function flowAngle(x, y, time) {
  return Math.sin(x * 0.007 + time) * Math.PI + Math.cos(y * 0.007 + time * 0.6) * Math.PI;
}

function lerpAngle(current, target, speed) {
  let difference = target - current;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return current + difference * speed;
}

export default function OrganicVectorField({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let arrows = [];
    let pointer = null;
    let dark = document.documentElement.classList.contains('dark');
    let time = 0;
    let frame;

    const buildGrid = () => {
      const previous = new Map(arrows.map((arrow) => [`${arrow.x}:${arrow.y}`, arrow]));
      const next = [];
      for (let x = GRID_SPACING / 2; x < width; x += GRID_SPACING) {
        for (let y = GRID_SPACING / 2; y < height; y += GRID_SPACING) {
          const existing = previous.get(`${x}:${y}`);
          next.push({
            x,
            y,
            angle: existing?.angle ?? flowAngle(x, y, time),
            phase: existing?.phase ?? Math.random() * Math.PI * 2,
          });
        }
      }
      arrows = next;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width || 480;
      height = rect.height || 480;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      buildGrid();
    };
    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const leave = () => { pointer = null; };

    const draw = () => {
      ctx.fillStyle = dark ? '#110f0c' : '#f5f1ea';
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      arrows.forEach((arrow) => {
        let distance = Infinity;
        if (pointer) {
          const dx = pointer.x - arrow.x;
          const dy = pointer.y - arrow.y;
          distance = Math.hypot(dx, dy);
          const proximity = Math.exp(-distance / DECAY_DISTANCE);
          const wobble = WOBBLE_AMPLITUDE * (1 - proximity * 0.7) * Math.sin(time * WOBBLE_FREQUENCY + arrow.phase);
          const target = Math.atan2(dy, dx) + wobble;
          arrow.angle = lerpAngle(arrow.angle, target, FAST_LERP * proximity + MINIMUM_LERP);
        } else {
          const idle = flowAngle(arrow.x, arrow.y, time) + WOBBLE_AMPLITUDE * 0.5 * Math.sin(time * WOBBLE_FREQUENCY * 0.8 + arrow.phase);
          arrow.angle = lerpAngle(arrow.angle, idle, IDLE_LERP);
        }

        const cosine = Math.cos(arrow.angle);
        const sine = Math.sin(arrow.angle);
        const alpha = pointer
          ? (dark ? 0.06 : 0.05) + Math.exp(-(distance * distance) / (200 * 200)) * (dark ? 0.84 : 0.75)
          : dark ? 0.18 : 0.15;
        const color = dark ? `rgba(255,255,255,${alpha})` : `rgba(28,25,22,${alpha})`;
        const tipX = arrow.x + cosine * SHAFT_LENGTH;
        const tipY = arrow.y + sine * SHAFT_LENGTH;
        const tailX = arrow.x - cosine * SHAFT_LENGTH;
        const tailY = arrow.y - sine * SHAFT_LENGTH;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        const headAngle = Math.PI - Math.PI / 5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + Math.cos(arrow.angle + headAngle) * HEAD_SIZE, tipY + Math.sin(arrow.angle + headAngle) * HEAD_SIZE);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + Math.cos(arrow.angle - headAngle) * HEAD_SIZE, tipY + Math.sin(arrow.angle - headAngle) * HEAD_SIZE);
        ctx.stroke();
      });
      time += 0.004;
      frame = requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(() => { dark = document.documentElement.classList.contains('dark'); });
    resize();
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

  return <canvas className="particle-field interactive-field interactive-field-vector" ref={canvasRef} aria-hidden="true" />;
}
