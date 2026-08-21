import { useEffect, useRef } from 'react';

const RADIALS = 24;
const RINGS = 14;
const SWAY_AMPLITUDE = 3.5;
const SWAY_SPEED = 0.00045;
const BOW_AMPLITUDE = 6;
const BOW_SPEED = 0.55;
const NODE_PUSH_RADIUS = 90;
const NODE_PUSH_STRENGTH = 3.2;
const SPRING = 0.07;
const SPRING_DAMPING = 0.84;
const STRAND_PUSH_RADIUS = 280;
const STRAND_PUSH_MAX = 18;
const TAU = Math.PI * 2;

function buildWeb(width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const maximumRadius = Math.hypot(width, height) * 0.56;
  const nodes = [{ baseX: centerX, baseY: centerY, phase: 0, shiftX: 0, shiftY: 0, velocityX: 0, velocityY: 0 }];

  for (let ring = 1; ring <= RINGS; ring += 1) {
    const radius = maximumRadius * (ring / RINGS);
    for (let spoke = 0; spoke < RADIALS; spoke += 1) {
      const angle = spoke * (TAU / RADIALS) - Math.PI / 2;
      const jitter = 1 + (Math.random() - 0.5) * 0.18;
      nodes.push({
        baseX: centerX + Math.cos(angle) * radius * jitter,
        baseY: centerY + Math.sin(angle) * radius * jitter,
        phase: Math.random() * TAU,
        shiftX: 0,
        shiftY: 0,
        velocityX: 0,
        velocityY: 0,
      });
    }
  }

  const strands = [];
  const addStrand = (a, b, kind, ring) => {
    const dx = nodes[b].baseX - nodes[a].baseX;
    const dy = nodes[b].baseY - nodes[a].baseY;
    const length = Math.hypot(dx, dy) || 1;
    strands.push({
      a,
      b,
      kind,
      ring,
      bowPhase: (nodes[a].phase + nodes[b].phase) / 2,
      bowPerpendicularX: -dy / length,
      bowPerpendicularY: dx / length,
    });
  };

  for (let spoke = 0; spoke < RADIALS; spoke += 1) {
    addStrand(0, 1 + spoke, 'radial', 1);
    for (let ring = 1; ring < RINGS; ring += 1) {
      addStrand(1 + (ring - 1) * RADIALS + spoke, 1 + ring * RADIALS + spoke, 'radial', ring + 1);
    }
  }
  for (let ring = 1; ring <= RINGS; ring += 1) {
    for (let spoke = 0; spoke < RADIALS; spoke += 1) {
      addStrand(1 + (ring - 1) * RADIALS + spoke, 1 + (ring - 1) * RADIALS + (spoke + 1) % RADIALS, 'ring', ring);
    }
  }
  return { nodes, strands };
}

export default function RadialConstellationField({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let web;
    let frame;
    let time = 0;
    let pointer = null;
    let dark = document.documentElement.classList.contains('dark');

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      web = buildWeb(width, height);
    };
    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const leave = () => { pointer = null; };

    const draw = () => {
      time += SWAY_SPEED;
      if (!web) return;

      web.nodes.forEach((node) => {
        const swayX = node.baseX + Math.sin(time * 1.1 + node.phase) * SWAY_AMPLITUDE;
        const swayY = node.baseY + Math.cos(time * 0.9 + node.phase * 1.4) * SWAY_AMPLITUDE;
        if (pointer) {
          const dx = swayX + node.shiftX - pointer.x;
          const dy = swayY + node.shiftY - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < NODE_PUSH_RADIUS && distance > 0.1) {
            const force = (1 - distance / NODE_PUSH_RADIUS) * NODE_PUSH_STRENGTH;
            node.velocityX += (dx / distance) * force;
            node.velocityY += (dy / distance) * force;
          }
        }
        node.velocityX += -node.shiftX * SPRING;
        node.velocityY += -node.shiftY * SPRING;
        node.velocityX *= SPRING_DAMPING;
        node.velocityY *= SPRING_DAMPING;
        node.shiftX += node.velocityX;
        node.shiftY += node.velocityY;
      });

      const positions = web.nodes.map((node) => ({
        x: node.baseX + Math.sin(time * 1.1 + node.phase) * SWAY_AMPLITUDE + node.shiftX,
        y: node.baseY + Math.cos(time * 0.9 + node.phase * 1.4) * SWAY_AMPLITUDE + node.shiftY,
      }));
      const foreground = dark ? '255,255,255' : '28,25,22';
      ctx.fillStyle = dark ? '#110f0c' : '#f5f1ea';
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      web.strands.forEach((strand) => {
        const start = positions[strand.a];
        const end = positions[strand.b];
        const middleX = (start.x + end.x) / 2;
        const middleY = (start.y + end.y) / 2;
        const bow = BOW_AMPLITUDE * Math.sin(time * BOW_SPEED * 60 + strand.bowPhase);
        let controlX = middleX + strand.bowPerpendicularX * bow;
        let controlY = middleY + strand.bowPerpendicularY * bow;
        if (pointer) {
          const dx = pointer.x - middleX;
          const dy = pointer.y - middleY;
          const distanceSquared = dx * dx + dy * dy;
          const distance = Math.sqrt(distanceSquared);
          const bend = STRAND_PUSH_MAX * Math.exp(-distanceSquared / (STRAND_PUSH_RADIUS * STRAND_PUSH_RADIUS));
          if (distance > 0.1) {
            controlX -= (dx / distance) * bend;
            controlY -= (dy / distance) * bend;
          }
        }
        const depth = 1 - (strand.ring - 1) / (RINGS + 2);
        let alpha = (strand.kind === 'radial' ? 0.42 : 0.2) * depth;
        if (pointer) {
          const dx = pointer.x - middleX;
          const dy = pointer.y - middleY;
          alpha *= 1 - Math.exp(-(dx * dx + dy * dy) / (STRAND_PUSH_RADIUS * STRAND_PUSH_RADIUS * 0.35)) * 0.82;
        }
        ctx.strokeStyle = `rgba(${foreground},${alpha})`;
        ctx.lineWidth = strand.kind === 'radial' ? 0.75 : 0.5;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
        ctx.stroke();
      });

      positions.forEach((position, index) => {
        let alpha = index === 0 ? 0.45 : 0.16;
        if (pointer) {
          const dx = pointer.x - position.x;
          const dy = pointer.y - position.y;
          alpha *= 1 - Math.exp(-(dx * dx + dy * dy) / (160 * 160)) * 0.82;
        }
        ctx.fillStyle = `rgba(${foreground},${alpha})`;
        ctx.beginPath();
        ctx.arc(position.x, position.y, index === 0 ? 1.8 : 1.1, 0, TAU);
        ctx.fill();
      });
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

  return <canvas className="particle-field interactive-field interactive-field-constellation" ref={canvasRef} aria-hidden="true" />;
}
