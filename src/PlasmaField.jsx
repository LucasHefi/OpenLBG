import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 plasma / electric storm field:
// branching lightning arcs crackle between virtual storm cells, the pointer
// attracts arcs and charges the air, a click triggers a full discharge
// strike at the pointer. Fallback contract identical to the other WebGL
// fields (data-webgl-fallback="poster" + CSS hides the canvas).

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const PLASMA_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;
  uniform float uStrikeTime;   // seconds since last click, large = none

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // distance to a jagged bolt path from anchor point toward target
  float bolt(vec2 uv, vec2 anchor, vec2 target, float t, float seed, float jag) {
    vec2 dir = target - anchor;
    // parametric distance from uv to the anchor->target line
    float len = max(length(dir), 0.0001);
    vec2 d = dir / len;
    vec2 rel = uv - anchor;
    float along = clamp(dot(rel, d), 0.0, len);
    vec2 foot = anchor + d * along;
    // jaggedness grows along the bolt and flickers with time
    float progress = along / len;
    float wobble = (noise(vec2(progress * 9.0 + seed * 31.0, t * 1.7 + seed)) - 0.5) * jag * len * 0.22 * progress;
    float side = sign(dot(rel - d * along, vec2(-d.y, d.x)));
    vec2 displaced = foot + vec2(-d.y, d.x) * wobble * side;
    float dist = length(uv - displaced);
    // core + halo
    float core = exp(-dist * dist * 2600.0) * 1.4;
    float halo = exp(-dist * 210.0) * 0.32;
    // shimmer: arcs flicker with pseudo-random life cycles
    float life = 0.5 + 0.5 * sin(t * 2.3 + seed * 41.0);
    life = pow(life, 5.0) * 1.3 + 0.12;
    return (core + halo) * life * (1.0 - 0.35 * progress);
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv * uAspect;
    vec2 pointer = uPointer * uAspect;

    // storm cell anchors, drifting slowly
    vec2 c1 = vec2(0.28 + 0.03 * sin(t * 0.11), 0.74) * uAspect;
    vec2 c2 = vec2(0.72 + 0.04 * sin(t * 0.07 + 2.0), 0.82) * uAspect;
    vec2 c3 = vec2(0.52 + 0.05 * sin(t * 0.09 + 4.0), 0.9) * uAspect;
    // pointer acts as a charged cell when hovering
    vec2 cP = pointer + vec2(0.0, 0.0);

    // deep storm sky with low rumbling clouds
    vec3 sky = mix(vec3(0.012, 0.014, 0.026), vec3(0.03, 0.034, 0.05), uv.y / uAspect.y);
    float clouds = noise(uv * 4.2 + vec2(t * 0.03, 0.0));
    clouds += 0.5 * noise(uv * 9.5 - vec2(t * 0.05, 0.0));
    // clouds are slightly lit by incoming arcs energy
    sky += vec3(0.05, 0.05, 0.08) * clouds * (0.35 + 0.65 * uEnergy);

    vec3 col = sky;

    // cyan-white lightning between cells (+ to pointer)
    vec3 boltCol = vec3(0.62, 0.82, 1.0);
    float b1 = bolt(uv, c1, c2, t, 3.7, 1.0);
    float b2 = bolt(uv, c2, c3, t, 8.2, 1.25);
    float b3 = bolt(uv, c3, c1, t, 14.5, 0.85);
    float bp1 = bolt(uv, c1, cP, t, 21.0, 1.1) * uEnergy;
    float bp2 = bolt(uv, c2, cP, t, 27.4, 1.2) * uEnergy;
    float bTotal = b1 * 0.85 + b2 * 0.7 + b3 * 0.75 + bp1 * 1.2 + bp2 * 1.0;
    col += boltCol * bTotal;

    // violet corona where bolt density is high
    col += vec3(0.36, 0.2, 0.75) * pow(min(bTotal, 1.4), 2.0) * 0.25;

    // click strike: massive vertical discharge at the pointer, decaying
    if (uStrikeTime < 1.2) {
      float strikeAge = uStrikeTime;
      vec2 strikeTop = vec2(pointer.x, uAspect.y);
      float strike = bolt(uv, strikeTop, pointer, t + strikeAge * 9.0, 55.0 + strikeAge * 40.0, 1.6);
      float flash = exp(-strikeAge * 4.2);
      col += vec3(0.85, 0.92, 1.0) * strike * flash * 2.4;
      // whole-sky flash
      col += vec3(0.28, 0.33, 0.45) * flash * 0.5;
    }

    // pointer glow: charged air ionization around the cursor
    float pdist = length(vUv - uPointer);
    col += vec3(0.5, 0.72, 1.0) * exp(-pdist * 7.0) * (0.10 + 0.35 * uEnergy);
    // sparks: tiny random flickers near the cursor
    float sparkField = noise(vUv * 130.0 + floor(t * 24.0));
    float sparks = pow(sparkField, 12.0) * exp(-pdist * 5.0) * (0.4 + uEnergy);
    col += vec3(0.8, 0.9, 1.0) * sparks * 0.8;

    // vignette
    float vig = smoothstep(1.3, 0.4, length(vUv - vec2(0.5, 0.55)) * 1.3);
    col *= vig * 0.9 + 0.1;

    float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.6, 0.0, 0.95);
    outColor = vec4(col, alpha);
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

export default function PlasmaField({ active = true }) {
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
      programs = createProgram(gl, PLASMA_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uStrikeTime']);
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
    let smooth = { x: 0.5, y: 0.42 };
    let energy = 0;
    let strikeStart = -10;

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
    const click = () => { strikeStart = performance.now() / 1000; };

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
      const targetY = pointer ? pointer.y : 0.42;
      smooth.x += (targetX - smooth.x) * 0.09;
      smooth.y += (targetY - smooth.y) * 0.09;
      energy += ((pointer ? 1 : 0) - energy) * 0.05;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uStrikeTime, timeSec - strikeStart);
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

  return <canvas className="particle-field interactive-field interactive-field-plasma" ref={canvasRef} aria-hidden="true" />;
}
