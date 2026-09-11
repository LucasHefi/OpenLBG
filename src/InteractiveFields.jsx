import { useEffect, useRef } from 'react';
import WebGLFluidField from './WebGLFluidField';
import MagneticDotsField from './MagneticDotsField';
import DiamondGridField from './DiamondGridField';
import RadialConstellationField from './RadialConstellationField';
import OrganicVectorField from './OrganicVectorField';
import GranularSignalField from './GranularSignalField';
import CausticsField from './CausticsField';
import AuroraField from './AuroraField';
import NebulaField from './NebulaField';

const TAU = Math.PI * 2;

function seeded(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function drawParticles(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'lighter';
  const cx = width * (0.42 + (pointer.x - 0.5) * 0.06);
  const cy = height * (0.48 + (pointer.y - 0.5) * 0.08);
  state.points.forEach((point, index) => {
    const angle = point.phase + time * point.speed;
    const stretch = 1.4 + Math.sin(time * 0.00025 + index) * 0.16;
    const x = cx + Math.cos(angle) * point.radius * stretch;
    const y = cy + Math.sin(angle) * point.radius * 0.5;
    const previousX = cx + Math.cos(angle - 0.11) * point.radius * stretch;
    const previousY = cy + Math.sin(angle - 0.11) * point.radius * 0.5;
    const color = index % 3 === 0 ? '111,223,255' : index % 3 === 1 ? '178,121,255' : '255,135,175';
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color},.24)`;
    ctx.lineWidth = Math.max(0.6, point.size * 0.45);
    ctx.moveTo(previousX, previousY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color},.92)`;
    ctx.shadowBlur = 16;
    ctx.shadowColor = ctx.fillStyle;
    ctx.arc(x, y, point.size, 0, TAU);
    ctx.fill();
  });
}

function drawTides(ctx, width, height, time, pointer) {
  const palette = ['66,232,210', '63,176,255', '35,118,214', '239,177,76'];
  ctx.globalCompositeOperation = 'lighter';
  const streamCount = Math.max(12, Math.round(height / 21));
  const gap = height / (streamCount + 1);
  const cursorX = pointer.x * width;
  const cursorY = pointer.y * height;
  const influenceX = Math.max(76, width * 0.17);
  const influenceY = Math.max(54, height * 0.25);

  for (let stream = 0; stream < streamCount; stream += 1) {
    const baseY = gap * (stream + 1);
    const color = palette[stream % palette.length];
    ctx.beginPath();
    for (let x = -8; x <= width + 8; x += 7) {
      const ambient = Math.sin(x * 0.012 + stream * 0.82 + time * 0.00042) * gap * 0.48
        + Math.sin(x * 0.0045 - stream * 0.37 - time * 0.00018) * gap * 0.35;
      const dx = (x - cursorX) / influenceX;
      const distanceY = baseY + ambient - cursorY;
      const side = distanceY === 0 ? (stream % 2 ? 1 : -1) : Math.sign(distanceY);
      const verticalCloseness = Math.exp(-Math.abs(distanceY) / influenceY);
      const displacement = side * influenceY * 0.72 * Math.exp(-(dx * dx) * 1.8) * verticalCloseness;
      const y = baseY + ambient + displacement;
      if (x === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const major = stream % 4 === 0;
    ctx.strokeStyle = `rgba(${color},${major ? 0.7 : 0.32})`;
    ctx.lineWidth = major ? 1.35 : 0.62;
    ctx.shadowBlur = major ? 13 : 6;
    ctx.shadowColor = `rgba(${color},.72)`;
    ctx.stroke();
  }
}

function drawRain(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'screen';
  const px = pointer.x * width;
  const py = pointer.y * height;
  state.drops.forEach((drop) => {
    drop.y += drop.speed;
    const dx = drop.x - px;
    const dy = drop.y - py;
    const distance = Math.hypot(dx, dy);
    if (pointer.inside && distance < Math.max(65, width * 0.11)) {
      const force = (1 - distance / Math.max(65, width * 0.11)) * 1.8;
      drop.x += (dx / Math.max(distance, 1)) * force + pointer.vx * 0.08;
      drop.y += (dy / Math.max(distance, 1)) * force * 0.35;
    }
    if (drop.y > height + 24) {
      drop.y = -20;
      drop.x = seeded(drop.seed, Math.floor(time / 1000)) * width;
    }
    if (drop.x < -12) drop.x = width + 12;
    if (drop.x > width + 12) drop.x = -12;
    const trail = drop.size * (3.4 + drop.speed * 0.8);
    const gradient = ctx.createLinearGradient(drop.x, drop.y - trail, drop.x, drop.y + drop.size);
    gradient.addColorStop(0, 'rgba(102,205,255,0)');
    gradient.addColorStop(1, 'rgba(177,226,255,.34)');
    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(0.45, drop.size * 0.42);
    ctx.moveTo(drop.x, drop.y - trail);
    ctx.quadraticCurveTo(drop.x - Math.sin(drop.seed) * 2, drop.y - trail * 0.35, drop.x, drop.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(205,239,255,.46)';
    ctx.ellipse(drop.x, drop.y, drop.size * 0.58, drop.size, 0, 0, TAU);
    ctx.fill();
  });
}

function drawGarden(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'lighter';
  const px = pointer.x * width;
  const py = pointer.y * height;
  state.plants.forEach((plant, index) => {
    const x = plant.x * width;
    const stemHeight = height * plant.height;
    const topY = height - stemHeight;
    const distance = Math.hypot(x - px, topY - py);
    const attraction = pointer.inside ? Math.max(0, 1 - distance / (width * 0.34)) : 0;
    const breeze = Math.sin(time * 0.00052 + plant.phase) * width * 0.012;
    const lean = breeze + (px - x) * attraction * 0.12;
    const color = index % 4 === 0 ? '125,118,255' : index % 3 === 0 ? '63,218,255' : '50,238,180';
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color},.42)`;
    ctx.lineWidth = plant.width;
    ctx.moveTo(x, height + 4);
    ctx.quadraticCurveTo(x + lean * 0.25, height - stemHeight * 0.48, x + lean, topY);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color},${0.42 + attraction * 0.45})`;
    ctx.shadowBlur = 9 + attraction * 18;
    ctx.shadowColor = `rgb(${color})`;
    ctx.arc(x + lean, topY, plant.bloom, 0, TAU);
    ctx.fill();
  });
  state.pulses.forEach((pulse) => {
    const age = (time - pulse.time) / 1000;
    if (age > 1.5) return;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(90,255,205,${(1 - age / 1.5) * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.arc(pulse.x * width, pulse.y * height, age * width * 0.19, 0, TAU);
    ctx.stroke();
  });
}

function drawStars(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'lighter';
  const px = pointer.x * width;
  const py = pointer.y * height;
  const stars = state.stars.map((star) => ({
    ...star,
    sx: star.x * width + Math.sin(time * 0.00008 + star.phase) * 2,
    sy: star.y * height + Math.cos(time * 0.00007 + star.phase) * 1.5,
  }));
  for (let a = 0; a < stars.length; a += 1) {
    const star = stars[a];
    const pointerDistance = Math.hypot(star.sx - px, star.sy - py);
    if (pointerDistance < width * 0.2) {
      for (let b = a + 1; b < stars.length; b += 1) {
        const other = stars[b];
        const distance = Math.hypot(star.sx - other.sx, star.sy - other.sy);
        if (distance < width * 0.095) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(123,173,255,${(1 - distance / (width * 0.095)) * 0.24})`;
          ctx.lineWidth = 0.55;
          ctx.moveTo(star.sx, star.sy);
          ctx.lineTo(other.sx, other.sy);
          ctx.stroke();
        }
      }
    }
    const glow = Math.max(0, 1 - pointerDistance / (width * 0.24));
    ctx.beginPath();
    ctx.fillStyle = `rgba(206,225,255,${0.42 + glow * 0.55})`;
    ctx.shadowBlur = 5 + glow * 12;
    ctx.shadowColor = '#91b9ff';
    ctx.arc(star.sx, star.sy, star.size + glow * 0.8, 0, TAU);
    ctx.fill();
  }
  state.pulses.forEach((pulse) => {
    const age = (time - pulse.time) / 1000;
    if (age > 2) return;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(141,174,255,${(1 - age / 2) * 0.42})`;
    ctx.lineWidth = 0.8;
    ctx.arc(pulse.x * width, pulse.y * height, 12 + age * width * 0.12, 0, TAU);
    ctx.stroke();
  });
}

function drawChrome(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'screen';
  const px = pointer.x * width;
  const py = pointer.y * height;
  for (let band = 0; band < 11; band += 1) {
    ctx.beginPath();
    for (let x = -8; x <= width + 8; x += 6) {
      const base = height * (0.18 + band * 0.065);
      const wave = Math.sin(x * 0.009 + band * 0.73 + time * 0.00026) * height * 0.032;
      const dx = (x - px) / Math.max(90, width * 0.16);
      const ripple = Math.sin(Math.abs(x - px) * 0.055 - time * 0.004) * Math.exp(-dx * dx) * height * 0.022;
      const lift = pointer.inside ? ripple * Math.exp(-Math.abs(base - py) / (height * 0.28)) : 0;
      const y = base + wave + lift;
      if (x === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const bright = band % 3 === 0;
    ctx.strokeStyle = bright ? 'rgba(196,231,255,.44)' : 'rgba(111,153,181,.16)';
    ctx.lineWidth = bright ? 1.35 : 0.7;
    ctx.shadowBlur = bright ? 10 : 3;
    ctx.shadowColor = '#9ad8ff';
    ctx.stroke();
  }
  state.pulses.forEach((pulse) => {
    const age = (time - pulse.time) / 1000;
    if (age > 1.8) return;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(225,242,255,${(1 - age / 1.8) * 0.52})`;
    ctx.lineWidth = 1.4;
    ctx.ellipse(pulse.x * width, pulse.y * height, 16 + age * width * 0.13, 7 + age * height * 0.07, 0, 0, TAU);
    ctx.stroke();
  });
}

function drawSand(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'lighter';
  const px = pointer.x * width;
  const py = pointer.y * height;
  state.grains.forEach((grain) => {
    const dx = grain.x - px;
    const dy = grain.y - py;
    const distance = Math.hypot(dx, dy);
    if (pointer.inside && distance < Math.max(54, width * 0.1)) {
      const force = (1 - distance / Math.max(54, width * 0.1)) * 0.24;
      grain.vx += (dx / Math.max(distance, 1)) * force + pointer.vx * 0.008;
      grain.vy += (dy / Math.max(distance, 1)) * force;
    }
    grain.vx = grain.vx * 0.985 + Math.sin(time * 0.0004 + grain.seed) * 0.006;
    grain.vy = grain.vy * 0.992 + 0.018;
    grain.x += grain.vx;
    grain.y += grain.vy;
    if (grain.y > height + 6 || grain.x < -12 || grain.x > width + 12) {
      grain.x = seeded(grain.seed, 4) * width;
      grain.y = -8 - seeded(grain.seed, 5) * height * 0.2;
      grain.vx = (seeded(grain.seed, 6) - 0.5) * 0.32;
      grain.vy = 0.08 + seeded(grain.seed, 7) * 0.32;
    }
    const color = grain.tint === 0 ? '255,190,100' : grain.tint === 1 ? '255,112,92' : '178,135,221';
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color},${grain.alpha})`;
    ctx.arc(grain.x, grain.y, grain.size, 0, TAU);
    ctx.fill();
  });
}

function drawSea(ctx, width, height, time, pointer, state) {
  ctx.globalCompositeOperation = 'lighter';
  const px = pointer.x * width;
  const py = pointer.y * height;
  state.jellies.forEach((jelly, index) => {
    const x = jelly.x * width + Math.sin(time * 0.00022 + jelly.phase) * width * 0.025;
    const y = ((jelly.y * height - time * jelly.speed) % (height * 1.3) + height * 1.3) % (height * 1.3) - height * 0.15;
    const radius = Math.min(width, height) * jelly.size;
    const distance = Math.hypot(x - px, y - py);
    const proximity = pointer.inside ? Math.max(0, 1 - distance / (width * 0.23)) : 0;
    const pulse = 0.72 + Math.sin(time * 0.002 + jelly.phase) * 0.16 + proximity * 0.5;
    const color = index % 3 === 0 ? '239,128,255' : index % 2 === 0 ? '104,226,255' : '129,149,255';
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color},${0.1 + proximity * 0.12})`;
    ctx.strokeStyle = `rgba(${color},${0.36 + proximity * 0.48})`;
    ctx.lineWidth = 1.1;
    ctx.shadowBlur = 14 + proximity * 22;
    ctx.shadowColor = `rgb(${color})`;
    ctx.arc(x, y, radius * pulse, Math.PI, TAU);
    ctx.quadraticCurveTo(x + radius * 0.55, y + radius * 0.42, x, y + radius * 0.28);
    ctx.quadraticCurveTo(x - radius * 0.55, y + radius * 0.42, x - radius * pulse, y);
    ctx.fill();
    ctx.stroke();
    for (let tentacle = -2; tentacle <= 2; tentacle += 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${color},${0.18 + proximity * 0.25})`;
      ctx.lineWidth = 0.55;
      ctx.moveTo(x + tentacle * radius * 0.18, y + radius * 0.25);
      ctx.bezierCurveTo(
        x + tentacle * radius * 0.2 + Math.sin(time * 0.001 + tentacle) * 5,
        y + radius * 0.75,
        x + tentacle * radius * 0.28,
        y + radius * 1.05,
        x + tentacle * radius * 0.2 + Math.cos(time * 0.0008 + tentacle) * 7,
        y + radius * 1.45,
      );
      ctx.stroke();
    }
  });
  state.pulses.forEach((pulse) => {
    const age = (time - pulse.time) / 1000;
    if (age > 2.2) return;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(101,225,255,${(1 - age / 2.2) * 0.36})`;
    ctx.lineWidth = 1;
    ctx.arc(pulse.x * width, pulse.y * height, 10 + age * width * 0.11, 0, TAU);
    ctx.stroke();
  });
}

const DRAWERS = {
  particles: drawParticles,
  tides: drawTides,
  rain: drawRain,
  garden: drawGarden,
  stars: drawStars,
  chrome: drawChrome,
  sand: drawSand,
  sea: drawSea,
};

function createState(effect) {
  if (effect === 'particles') {
    return { points: Array.from({ length: 150 }, (_, index) => ({
      phase: index * 0.76,
      radius: 18 + (index % 27) * 7,
      speed: 0.00015 + (index % 8) * 0.000025,
      size: 0.9 + (index % 5) * 0.48,
    })) };
  }
  if (effect === 'rain') {
    return { drops: Array.from({ length: 72 }, (_, index) => ({
      seed: index + 1,
      x: seeded(index, 1) * 1000,
      y: seeded(index, 2) * 800,
      size: 0.8 + seeded(index, 3) * 2.8,
      speed: 0.35 + seeded(index, 4) * 1.15,
    })) };
  }
  if (effect === 'garden') {
    return { plants: Array.from({ length: 34 }, (_, index) => ({
      x: 0.02 + seeded(index, 1) * 0.96,
      height: 0.12 + seeded(index, 2) * 0.52,
      phase: seeded(index, 3) * TAU,
      width: 0.45 + seeded(index, 4) * 0.75,
      bloom: 0.9 + seeded(index, 5) * 2.2,
    })), pulses: [] };
  }
  if (effect === 'stars') {
    return { stars: Array.from({ length: 78 }, (_, index) => ({
      x: 0.025 + seeded(index, 1) * 0.95,
      y: 0.035 + seeded(index, 2) * 0.92,
      phase: seeded(index, 3) * TAU,
      size: 0.45 + seeded(index, 4) * 1.35,
    })), pulses: [] };
  }
  if (effect === 'sand') {
    return { grains: Array.from({ length: 230 }, (_, index) => ({
      seed: index + 1,
      x: seeded(index, 1) * 1000,
      y: seeded(index, 2) * 800,
      vx: (seeded(index, 3) - 0.5) * 0.35,
      vy: 0.08 + seeded(index, 4) * 0.3,
      size: 0.35 + seeded(index, 5) * 1.05,
      alpha: 0.25 + seeded(index, 6) * 0.6,
      tint: index % 3,
    })) };
  }
  if (effect === 'sea') {
    return { jellies: Array.from({ length: 7 }, (_, index) => ({
      x: 0.1 + seeded(index, 1) * 0.8,
      y: 0.12 + seeded(index, 2) * 0.95,
      size: 0.035 + seeded(index, 3) * 0.045,
      speed: 0.004 + seeded(index, 4) * 0.009,
      phase: seeded(index, 5) * TAU,
    })), pulses: [] };
  }
  return { pulses: [] };
}

function CanvasInteractiveField({ effect = 'particles', active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    const state = createState(effect);
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, vx: 0, vy: 0, inside: false };
    let frame;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (state.drops) state.drops.forEach((drop) => { drop.x %= Math.max(width, 1); drop.y %= Math.max(height, 1); });
      if (state.grains) state.grains.forEach((grain) => { grain.x %= Math.max(width, 1); grain.y %= Math.max(height, 1); });
    };
    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      const nextX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const nextY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      pointer.vx = (nextX - pointer.targetX) * rect.width;
      pointer.vy = (nextY - pointer.targetY) * rect.height;
      pointer.targetX = nextX;
      pointer.targetY = nextY;
      pointer.inside = true;
    };
    const leave = () => { pointer.inside = false; pointer.targetX = 0.5; pointer.targetY = 0.5; };
    const click = () => {
      if (!state.pulses) state.pulses = [];
      state.pulses.push({ x: pointer.targetX, y: pointer.targetY, time: performance.now() });
      state.pulses = state.pulses.slice(-5);
    };
    const draw = (time) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.075;
      pointer.y += (pointer.targetY - pointer.y) * 0.075;
      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
      if (state.pulses) state.pulses = state.pulses.filter((pulse) => time - pulse.time < 2400);
      ctx.clearRect(0, 0, width, height);
      ctx.shadowBlur = 0;
      DRAWERS[effect]?.(ctx, width, height, time, pointer, state);
      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('click', click);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('click', click);
    };
  }, [active, effect]);

  return <canvas className={`particle-field interactive-field interactive-field-${effect}`} ref={canvasRef} aria-hidden="true" />;
}

export default function InteractiveField(props) {
  if (props.effect === 'fluid') return <WebGLFluidField active={props.active} />;
  if (props.effect === 'magnetic') return <MagneticDotsField active={props.active} />;
  if (props.effect === 'diamond') return <DiamondGridField active={props.active} />;
  if (props.effect === 'constellation') return <RadialConstellationField active={props.active} />;
  if (props.effect === 'vector') return <OrganicVectorField active={props.active} />;
  if (props.effect === 'granular') return <GranularSignalField active={props.active} />;
  if (props.effect === 'caustics') return <CausticsField active={props.active} />;
  if (props.effect === 'aurora') return <AuroraField active={props.active} />;
  if (props.effect === 'nebula') return <NebulaField active={props.active} />;
  return <CanvasInteractiveField {...props} />;
}
