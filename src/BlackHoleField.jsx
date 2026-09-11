import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 black hole / gravity lens field:
// a full-fragment gravitational lens warps a procedural starfield around
// the event horizon; the pointer moves the singularity, a click ramps up
// the mass (accretion brightens, lens radius widens, then relaxes).
// Fallback contract identical to the other WebGL fields
// (data-webgl-fallback="poster" + CSS hides the canvas).

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const HOLE_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;      // pointer presence 0..1
  uniform vec2 uAspect;
  uniform float uMass;        // smoothed click mass pulse 0..1

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // static star layer: sparse bright points on a dark galaxy field
  float stars(vec2 p, float density) {
    vec2 grid = p * density;
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    float rnd = hash(cell);
    if (rnd < 0.965) return 0.0;             // mostly empty space
    vec2 starPos = vec2(hash(cell + 1.3), hash(cell + 7.7));
    float d = length(f - starPos);
    float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + rnd * 3.0) + rnd * 40.0);
    return exp(-d * d * 90.0) * twinkle;
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv;
    // holistic aspect-correct space
    vec2 p = (uv - 0.5) * uAspect;
    vec2 hole = (uPointer - 0.5) * uAspect;

    // singularity moves with the pointer (already smoothed), with a slow
    // orbital drift so it breathes even when the pointer rests
    hole += 0.02 * vec2(sin(t * 0.23), cos(t * 0.31));

    // mass pulse widens lens + brightens accretion
    float mass = 0.55 + 0.25 * uEnergy + 0.55 * uMass;

    vec2 d = p - hole;
    float r = length(d) + 0.0001;
    float rs = 0.085 * mass;                  // Schwarzschild-ish radius on screen

    // gravitational lens: light bends around the hole, deflection ∝ 1/r²
    float deflect = (rs * rs * 0.085) / (r * r + 0.0005);
    // Einstein ring: maximize brightness at the deflection crest
    float ring = exp(-abs(r - rs * 2.05) * (70.0 - uMass * 22.0));
    // probe direction: pull the sample toward the singularity by deflect
    vec2 probeP = p - normalize(d) * deflect * mass;
    // swirl: frame dragging near the horizon
    float swirl = (rs * 0.9) / (r + rs * 1.6);
    float ang = swirl * 2.6 + t * 0.05 * (1.0 + uMass);
    float ca = cos(ang), sa = sin(ang);
    vec2 rel = probeP - hole;
    probeP = hole + vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);

    // warped star field (two parallax layers)
    vec2 sky = probeP + vec2(t * 0.004, 0.0) + 0.5;
    float s1 = stars(sky, 26.0);
    float s2 = stars((probeP + hole * 0.35) * 0.7 + vec2(t * 0.0022, -t * 0.0014) + 0.5, 15.0);

    // galaxy dust: cheap fbm tint, warped with the same field
    float dust = noise((probeP + hole * 0.2) * 2.6 + vec2(t * 0.01, 0.0)) * 0.5
               + noise((probeP + hole * 0.2) * 5.4 - vec2(t * 0.008, 0.0)) * 0.25;
    vec3 space = vec3(0.010, 0.012, 0.022);
    space += vec3(0.05, 0.065, 0.11) * dust * 0.5;
    space += vec3(0.9, 0.95, 1.0) * s1 * 0.85;
    space += vec3(0.75, 0.82, 1.0) * s2 * 0.45;

    // accretion disk: hot plasma ring seen edge-on, slowly rotating bands
    vec2 diskP = p - hole;
    float diskR = length(diskP);
    float ringA = atan(diskP.y, diskP.x);
    float bands = 0.6 + 0.4 * sin(ringA * 7.0 - t * 1.15 + sin(ringA * 3.0 - t * 0.4) * 1.3);
    bands = pow(bands, 1.6);
    float disk = smoothstep(rs * 1.02, rs * 1.12, diskR) * smoothstep(rs * 4.6, rs * 2.6, diskR);
    vec3 hot = mix(vec3(1.0, 0.45, 0.10), vec3(1.0, 0.88, 0.60), bands);
    space += hot * disk * bands * (0.85 + 1.3 * uMass + 0.5 * uEnergy);

    // event horizon: absolute black core with a thin photon-ring edge
    float core = smoothstep(rs, rs * 1.06, r);
    space *= 1.0 - core;
    space += vec3(0.85, 0.9, 1.0) * ring * (0.3 + 0.45 * uMass);
    // photons skimming the horizon add a warm rim
    space += vec3(1.0, 0.68, 0.30) * exp(-abs(r - rs * 1.04) * 190.0) * (0.25 + 0.75 * uMass);

    // click mass pulse bloom: brief brightening of everything nearby
    space *= 1.0 + uMass * 0.35 * exp(-r * 2.2);

    // vignette
    float vig = smoothstep(1.35, 0.4, length(vUv - 0.5) * 1.3);
    space *= vig * 0.92 + 0.08;

    float alpha = clamp(max(space.r, max(space.g, space.b)) * 1.7, 0.0, 0.96);
    outColor = vec4(space, alpha);
  }
`;

function createProgram(gl, fragmentSource, uniforms) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return {
    program,
    uniforms: Object.fromEntries(uniforms.map((n) => [n, gl.getUniformLocation(program, n)])),
  };
}

export default function BlackHoleField({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      canvas.dataset.webglFallback = 'poster';
      canvas.dataset.webglReason = 'webgl2';
      return undefined;
    }

    let programs;
    try {
      programs = createProgram(gl, HOLE_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uMass']);
    } catch {
      canvas.dataset.webglFallback = 'poster';
      canvas.dataset.webglReason = 'shader';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return undefined;
    }

    let frame;
    let width = 0;
    let height = 0;
    let pointer = null;
    let smooth = { x: 0.5, y: 0.48 };
    let energy = 0;
    let mass = 0;          // smoothed click pulse
    let massTarget = 0;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(programs.program, 'aPosition');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer = {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      };
    };
    const leave = () => { pointer = null; };
    const click = () => { massTarget = 1; };

    const draw = (timeMs) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const nextWidth = Math.max(2, Math.round(rect.width * ratio));
      const nextHeight = Math.max(2, Math.round(rect.height * ratio));
      if (nextWidth !== width || nextHeight !== height) {
        width = nextWidth;
        height = nextHeight;
        canvas.width = width;
        canvas.height = height;
      }

      const targetX = pointer ? pointer.x : 0.5;
      const targetY = pointer ? pointer.y : 0.48;
      smooth.x += (targetX - smooth.x) * 0.065;
      smooth.y += (targetY - smooth.y) * 0.065;
      energy += ((pointer ? 1 : 0) - energy) * 0.04;
      // mass: fast attack, slow relaxation (gravity feels heavy and lingers)
      mass += (massTarget - mass) * (massTarget > mass ? 0.28 : 0.022);
      if (mass < 0.002 && massTarget === 0) mass = 0;
      massTarget = 0;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uMass, mass);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(draw);
    };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('click', click);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('click', click);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [active]);

  return <canvas className="particle-field interactive-field interactive-field-blackhole" ref={canvasRef} aria-hidden="true" />;
}
