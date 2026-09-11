import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 solar surface field: a churning
// photosphere of convection granules wrapped in limb darkening, filaments
// drifting between cells, and the pointer electrating the plasma - a click
// ignites a flare that erupts outward with plume arcs and a corona bloom.
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

const SOLAR_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;
  uniform float uFlareTime;   // seconds since last click, large = none

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * noise(p);
      p = p * 2.07 + vec2(19.0, 11.0);
      amp *= 0.5;
    }
    return sum;
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv * uAspect;
    vec2 pointer = uPointer * uAspect;

    // ---- photosphere: boiling convection granules with domain warp ----
    // the hot plasma crawls: two time-shifted fbm layers warped by each other
    vec2 flow = vec2(t * 0.021, t * 0.017);
    float warpN = fbm(uv * 3.4 + flow);
    vec2 warp = vec2(fbm(uv * 2.2 - flow + warpN * 1.4) - 0.5,
                     fbm(uv * 2.2 + flow.yx + 7.3 - warpN) - 0.5) * 0.55;
    float granules = fbm((uv + warp) * 9.5 - flow * 1.4);
    granules += 0.5 * fbm((uv + warp * 1.4) * 19.0 + flow * 2.2);
    // voronoi-ish cell walls: brighter ridges where granulation crosses zero
    float cells = abs(granules - 0.5) * 2.0;

    // ---- solar palette: dark granule lanes vs hot cell centers ----
    vec3 coolLane = vec3(0.42, 0.14, 0.02);
    vec3 hotCell = vec3(1.0, 0.55, 0.12);
    vec3 plasma = mix(hotCell, coolLane, smoothstep(0.15, 0.65, cells));
    // white-hot caps on the most active cells
    plasma += vec3(1.0, 0.92, 0.72) * pow(max(0.0, 1.0 - cells * 1.7), 3.0) * 0.55;

    // ---- filaments: thin darker threads sliding between cells ----
    float fil = pow(abs(noise((uv + warp * 1.8) * 5.6 + flow * 2.2) - 0.5) * 2.0, 0.18);
    plasma *= mix(0.62, 1.0, fil);

    // ---- limb darkening (curvature falloff from center of the disc) ----
    float limb = smoothstep(0.95, 0.35, length(vUv - 0.5) * 1.42);
    plasma *= 0.35 + 0.65 * limb;

    // ---- pointer: plasma electrates around the cursor ----
    float pdist = length(uv - pointer);
    float charge = exp(-pdist * 3.2) * (0.25 + 0.75 * uEnergy);
    vec3 col = plasma;
    col += vec3(1.0, 0.75, 0.35) * charge * (0.35 + 0.4 * cells);
    col += vec3(1.0, 0.5, 0.15) * exp(-pdist * 7.0) * (0.12 + 0.3 * uEnergy);

    // magnetic brightpoints: tiny hot sparks flickering near the pointer
    float sparkGrid = hash(floor(vUv * 240.0) + floor(t * 5.0) * 61.7);
    float sparks = step(0.985, sparkGrid) * exp(-pdist * 5.5) * (0.3 + uEnergy);
    col += vec3(1.0, 0.95, 0.85) * sparks;

    // ---- click flare: eruption with arcs and a slow bloom ----
    if (uFlareTime >= 0.0 && uFlareTime < 2.6) {
      float flareAge = uFlareTime;
      // eruptive ring racing outward along the surface
      float ringR = flareAge * 0.55;
      float ring = exp(-abs(pdist - ringR) * (9.0 - min(flareAge, 1.5) * 3.0));
      col += vec3(1.0, 0.62, 0.18) * ring * exp(-flareAge * 1.4) * 1.5;
      // plume arcs: looping prominence arcs above the flare point
      float arcNoise = noise(vec2(pdist - flareAge * 0.9, flareAge * 1.3) * 21.0);
      float arcs = pow(max(0.0, arcNoise), 6.0) * exp(-pdist * 2.6) * exp(-abs(flareAge - 0.65) * 2.2);
      col += vec3(1.0, 0.78, 0.42) * arcs * 1.15;
      // initial white-hot core flash, decaying
      float core = exp(-flareAge * 7.5) * exp(-pdist * 5.5);
      col += vec3(1.0, 0.97, 0.88) * core * 1.45;
      // lingering corona bloom
      col += vec3(0.95, 0.55, 0.20) * exp(-pdist * 2.0) * exp(-flareAge * 1.05) * 0.4;
    }

    // ---- vignette keeps the star surface centered ----
    float vig = smoothstep(1.34, 0.45, length(vUv - 0.5) * 1.34);
    col *= vig * 0.96 + 0.04;

    // sun is opaque: alpha high, but allow dark limb edges to blend
    float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.85, 0.0, 0.97);
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

export default function SolarField({ active = true }) {
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
      programs = createProgram(gl, SOLAR_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uFlareTime']);
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
    let smooth = { x: 0.5, y: 0.5 };
    let energy = 0;
    let flareStart = -10;

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
    const click = () => { flareStart = performance.now() / 1000; };

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
      const targetY = pointer ? pointer.y : 0.5;
      smooth.x += (targetX - smooth.x) * 0.075;
      smooth.y += (targetY - smooth.y) * 0.075;
      energy += ((pointer ? 1 : 0) - energy) * 0.045;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uFlareTime, timeSec - flareStart);
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

  return <canvas className="particle-field interactive-field interactive-field-solar" ref={canvasRef} aria-hidden="true" />;
}
