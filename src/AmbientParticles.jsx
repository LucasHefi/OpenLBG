import { useEffect, useRef } from 'react';

const COLORS = [
  [215, 255, 99],
  [111, 215, 255],
  [181, 139, 255],
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function AmbientParticles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const frameInterval = coarsePointer ? 1000 / 30 : 0;
    const pointer = { x: -1000, y: -1000, active: false };
    let width = 0;
    let height = 0;
    let particles = [];
    let animationFrame = 0;
    let lastFrame = 0;
    let lastPaint = 0;

    const createParticles = () => {
      const areaPerParticle = coarsePointer ? 36000 : 24000;
      const maximum = coarsePointer ? 36 : 68;
      const count = clamp(Math.round((width * height) / areaPerParticle), 24, maximum);

      particles = Array.from({ length: count }, (_, index) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.035 + Math.random() * 0.055;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 0.8 + Math.random() * 1.35,
          color: COLORS[index % COLORS.length],
          pulse: Math.random() * Math.PI * 2,
        };
      });
    };

    const resize = () => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.5);

      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createParticles();
      if (reduceMotion) paint(0, false);
    };

    const paint = (time, update = true) => {
      const step = lastFrame ? clamp((time - lastFrame) / 16.67, 0.25, 2) : 1;
      lastFrame = time;
      context.clearRect(0, 0, width, height);

      if (update) {
        for (const particle of particles) {
          if (pointer.active) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distanceSquared = dx * dx + dy * dy;
            const radius = 155;

            if (distanceSquared > 1 && distanceSquared < radius * radius) {
              const distance = Math.sqrt(distanceSquared);
              const force = (1 - distance / radius) * 0.022;
              particle.vx += (dx / distance) * force * step;
              particle.vy += (dy / distance) * force * step;
            }
          }

          particle.vx *= Math.pow(0.985, step);
          particle.vy *= Math.pow(0.985, step);
          const velocity = Math.hypot(particle.vx, particle.vy);
          if (velocity < 0.025) {
            particle.vx += Math.cos(particle.pulse) * 0.002;
            particle.vy += Math.sin(particle.pulse) * 0.002;
          } else if (velocity > 0.32) {
            particle.vx *= 0.94;
            particle.vy *= 0.94;
          }

          particle.x += particle.vx * step;
          particle.y += particle.vy * step;
          particle.pulse += 0.004 * step;

          if (particle.x < -18) particle.x = width + 18;
          if (particle.x > width + 18) particle.x = -18;
          if (particle.y < -18) particle.y = height + 18;
          if (particle.y > height + 18) particle.y = -18;
        }
      }

      const connectionDistance = coarsePointer ? 94 : 118;
      const connectionDistanceSquared = connectionDistance * connectionDistance;
      context.lineWidth = 0.65;

      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const a = particles[first];
          const b = particles[second];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < connectionDistanceSquared) {
            const opacity = (1 - Math.sqrt(distanceSquared) / connectionDistance) * 0.15;
            context.strokeStyle = `rgba(154, 197, 214, ${opacity})`;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
          }
        }
      }

      for (const particle of particles) {
        const pulse = 0.78 + Math.sin(particle.pulse) * 0.18;
        const [red, green, blue] = particle.color;
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.08 * pulse})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * 4.2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.62 * pulse})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const draw = (time) => {
      animationFrame = window.requestAnimationFrame(draw);
      if (frameInterval && time - lastPaint < frameInterval - 1) return;
      lastPaint = time;
      paint(time);
    };

    const handlePointerMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleVisibility = () => {
      window.cancelAnimationFrame(animationFrame);
      if (!document.hidden && !reduceMotion) {
        lastFrame = 0;
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    resize();
    if (reduceMotion) {
      paint(0, false);
    } else {
      animationFrame = window.requestAnimationFrame(draw);
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', handlePointerLeave);
      document.addEventListener('visibilitychange', handleVisibility);
    }
    window.addEventListener('resize', resize, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="ambient-particles" aria-hidden="true" />;
}
