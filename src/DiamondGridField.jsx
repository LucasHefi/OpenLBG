import { useEffect, useRef } from 'react';

const LOOP_MS = 64000;
const EVENT_COUNT = 34;
const STATIC_TIME_MS = 27000;
const TAU = Math.PI * 2;
const GRID_COS = Math.SQRT1_2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (value) => {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gridToScreen(field, x, y) {
  return {
    x: GRID_COS * x - GRID_COS * y + field.width * 0.5,
    y: GRID_COS * x + GRID_COS * y + field.height * 0.5,
  };
}

function buildField(width, height, seed) {
  const random = mulberry32(seed);
  const cell = clamp(Math.min(width, height) * 0.113, 65, 124);
  const extent = Math.hypot(width, height) * 0.72;
  const x0 = -extent - cell * random();
  const y0 = -extent - cell * random();
  const columns = Math.ceil((extent * 2 - x0) / cell) + 2;
  const rows = Math.ceil((extent * 2 - y0) / cell) + 2;
  const events = [];
  let cursor = 0;
  const gaps = Array.from({ length: EVENT_COUNT }, (_, index) => (index % 3 === 0 ? 1200 + random() * 1400 : 3600 + random() * 3200));
  const gapScale = LOOP_MS / gaps.reduce((sum, gap) => sum + gap, 0);

  const visibleNode = () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const column = 1 + Math.floor(random() * Math.max(1, columns - 2));
      const row = 1 + Math.floor(random() * Math.max(1, rows - 2));
      const point = gridToScreen({ width, height }, x0 + column * cell, y0 + row * cell);
      if (point.x > 0 && point.x < width && point.y > 0 && point.y < height) return { column, row };
    }
    return { column: Math.floor(columns / 2), row: Math.floor(rows / 2) };
  };

  gaps.forEach((gap) => {
    const position = visibleNode();
    events.push({
      ...position,
      start: cursor,
      duration: 25000 + random() * 7000,
      decayStart: 10500 + random() * 4500,
      travel: 3200 + random() * 900,
      reach: 2.5 + random() * 1.25,
      phase: random() * TAU,
    });
    cursor += gap * gapScale;
  });
  return { width, height, cell, x0, y0, columns, rows, events };
}

function addStar(ctx, x, y, radius, inner) {
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + inner, y - inner);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x + inner, y + inner);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - inner, y + inner);
  ctx.lineTo(x - radius, y);
  ctx.lineTo(x - inner, y - inner);
  ctx.closePath();
}

export default function DiamondGridField({ active = true, seed = 1337 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    const layer = document.createElement('canvas');
    const layerCtx = layer.getContext('2d');
    if (!ctx || !layerCtx) return undefined;

    let width = 0;
    let height = 0;
    let ratio = 1;
    let field;
    let frame;
    let last = 0;
    let elapsed = 0;
    let dark = document.documentElement.classList.contains('dark');
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      layer.width = canvas.width;
      layer.height = canvas.height;
      field = buildField(width, height, seed);
    };

    const eventAge = (event, time) => {
      const age = time - event.start;
      return age < 0 ? age + LOOP_MS : age;
    };

    const eventLevel = (event, age) => {
      if (age >= event.duration) return 0;
      const attack = smoothstep(age / 900);
      const decay = age <= event.decayStart ? 1 : 1 - smoothstep((age - event.decayStart) / (event.duration - event.decayStart));
      return attack * decay * (0.94 + 0.06 * Math.sin(age * 0.00055 + event.phase));
    };

    const draw = (time) => {
      if (!field) return;
      const ink = dark ? '255,255,255' : '14,14,16';
      const pulse = dark ? 0.7 : 0.5;
      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, layer.width, layer.height);
      layerCtx.setTransform(ratio * GRID_COS, ratio * GRID_COS, -ratio * GRID_COS, ratio * GRID_COS, ratio * width * 0.5, ratio * height * 0.5);
      layerCtx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      layerCtx.lineWidth = 1;
      layerCtx.strokeStyle = `rgba(${ink},${dark ? 0.06 : 0.07})`;
      layerCtx.beginPath();
      for (let column = 0; column < field.columns; column += 1) {
        const x = field.x0 + column * field.cell;
        layerCtx.moveTo(x, field.y0);
        layerCtx.lineTo(x, field.y0 + (field.rows - 1) * field.cell);
      }
      for (let row = 0; row < field.rows; row += 1) {
        const y = field.y0 + row * field.cell;
        layerCtx.moveTo(field.x0, y);
        layerCtx.lineTo(field.x0 + (field.columns - 1) * field.cell, y);
      }
      layerCtx.stroke();

      layerCtx.fillStyle = `rgba(${ink},${dark ? 0.16 : 0.18})`;
      layerCtx.beginPath();
      for (let row = 0; row < field.rows; row += 1) {
        for (let column = 0; column < field.columns; column += 1) {
          addStar(layerCtx, field.x0 + column * field.cell, field.y0 + row * field.cell, 3.3, 0.68);
        }
      }
      layerCtx.fill();

      field.events.forEach((event) => {
        const age = eventAge(event, time);
        const level = eventLevel(event, age);
        if (level <= 0.002) return;
        const x = field.x0 + event.column * field.cell;
        const y = field.y0 + event.row * field.cell;
        const span = event.travel * event.reach * 2.6;
        const progress = Math.min(1, age / span);
        const front = event.reach * (1 - (1 - progress) ** 3);
        const directions = [[-1, 0, event.column], [1, 0, field.columns - 1 - event.column], [0, -1, event.row], [0, 1, field.rows - 1 - event.row]];
        directions.forEach(([dx, dy, available]) => {
          const distance = Math.min(front, available);
          const endX = x + dx * distance * field.cell;
          const endY = y + dy * distance * field.cell;
          layerCtx.strokeStyle = `rgba(${ink},${pulse * level * 0.54})`;
          layerCtx.lineWidth = 0.95;
          layerCtx.beginPath();
          layerCtx.moveTo(x, y);
          layerCtx.lineTo(endX, endY);
          layerCtx.stroke();
        });
        layerCtx.fillStyle = `rgba(${ink},${pulse * level})`;
        layerCtx.beginPath();
        addStar(layerCtx, x, y, 10.5, 1.45);
        layerCtx.fill();
      });

      layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      layerCtx.globalCompositeOperation = 'destination-in';
      const mask = layerCtx.createLinearGradient(0, height, width, 0);
      mask.addColorStop(0, 'rgba(255,255,255,0)');
      mask.addColorStop(0.18, 'rgba(255,255,255,.18)');
      mask.addColorStop(0.36, 'rgba(255,255,255,1)');
      mask.addColorStop(0.64, 'rgba(255,255,255,1)');
      mask.addColorStop(0.82, 'rgba(255,255,255,.18)');
      mask.addColorStop(1, 'rgba(255,255,255,0)');
      layerCtx.fillStyle = mask;
      layerCtx.fillRect(0, 0, width, height);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = dark ? '#000' : '#faf8f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
    };

    const animate = (now) => {
      if (!reduced) elapsed = (elapsed + Math.min(33, last ? now - last : 16)) % LOOP_MS;
      last = now;
      draw(reduced ? STATIC_TIME_MS : elapsed);
      frame = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(resize);
    const mutationObserver = new MutationObserver(() => { dark = document.documentElement.classList.contains('dark'); });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { reduced = motion.matches; };
    resize();
    resizeObserver.observe(canvas);
    mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    motion.addEventListener('change', motionChanged);
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      motion.removeEventListener('change', motionChanged);
      layer.width = 0;
      layer.height = 0;
    };
  }, [active, seed]);

  return <canvas className="particle-field interactive-field interactive-field-diamond" ref={canvasRef} aria-hidden="true" />;
}
