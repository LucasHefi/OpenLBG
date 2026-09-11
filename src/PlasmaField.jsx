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
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // stepped-leader channel: a polyline through per-segment way-points with
  // sharp kinks between straight runs - the signature look of real lightning.
  float wp(float seed, float seg) { return (hash1(seed + seg * 17.0) - 0.5) * 2.2; }

  float channel(vec2 uv, vec2 anchor, vec2 target, float t, float seed, float jag) {
    vec2 dir = target - anchor;
    float len = max(length(dir), 0.0001);
    vec2 d = dir / len;
    vec2 perp = vec2(-d.y, d.x);
    vec2 rel = uv - anchor;
    float along = clamp(dot(rel, d), 0.0, len);
    float progress = along / len;
    // 7 segments; way-points are straight-line interpolated so kinks land
    // at segment boundaries, lateral scale tapers near the anchor
    float seg = progress * 7.0;
    float segIndex = floor(seg);
    float segPhase = fract(seg);
    float lat0 = wp(seed, segIndex);
    float lat1 = wp(seed, segIndex + 1.0);
    float lateral = mix(lat0, lat1, segPhase);
    vec2 center = anchor + d * along + perp * lateral * jag * len * 0.11 * (0.15 + progress);
    float dist = length(dot(uv - center, perp));
    // sharper core, softer sheet glow
    float core = exp(-dist * dist * 3000.0) * 1.3;
    float glow = exp(-dist * 110.0) * 0.24;
    return core + glow;
  }

  // discharge life tuned to real cloud-to-cloud lightning: a bolt fires
  // every ~2.5-6 s per pair (rate = 0.22-0.48 Hz), the flash itself decays
  // fast (~90 ms visible tail), with an optional re-strike ~180 ms later.
  float life(float t, float seed) {
    float rate = 0.24 + hash1(seed * 7.0) * 0.2;
    float slot = floor(t * rate + seed);
    float phase = fract(t * rate + seed);
    float r = hash1(slot * 13.3 + seed);
    float on = step(0.45, r);
    float decay = exp(-phase * 26.0);
    float restrike = exp(-abs(phase - (0.07 + r * 0.08)) * 95.0) * step(0.62, r);
    return (decay + restrike) * on;
  }

  float bolt(vec2 uv, vec2 anchor, vec2 target, float t, float seed, float jag) {
    float rate = 0.24 + hash1(seed * 7.0) * 0.2;
    // quantize time by the owning bolt's discharge slot so shape freezes
    float tq = floor(t * rate + seed) * (1.0 / rate);
    float main = channel(uv, anchor, target, tq, seed, jag);
    // two branches splitting off the main channel at seeded points
    float len = max(length(target - anchor), 0.0001);
    vec2 dir = (target - anchor) / len;
    vec2 p1 = anchor + dir * len * (0.22 + hash1(seed) * 0.2);
    vec2 p2 = anchor + dir * len * (0.52 + hash1(seed * 3.0) * 0.22);
    vec2 off = vec2(-dir.y, dir.x);
    vec2 b1Target = p1 + off * (hash1(seed * 5.0) - 0.4) * len * 0.5 + vec2(0.0, 0.16);
    vec2 b2Target = p2 - off * (hash1(seed * 9.0) - 0.35) * len * 0.55 + vec2(0.0, 0.04);
    float b1 = channel(uv, p1, b1Target, tq, seed + 11.0, jag * 1.45);
    float b2 = channel(uv, p2, b2Target, tq, seed + 29.0, jag * 1.5);
    // re-strike re-rolls the channel shape: pass unquantized t for the second hit
    float flash = life(t, seed);
    float r = hash1(floor(t * rate + seed) * 13.3 + seed);
    float phase = fract(t * rate + seed);
    float restrikeOn = exp(-abs(phase - (0.07 + r * 0.08)) * 95.0) * step(0.62, r);
    float restrike = channel(uv, anchor, target, t, seed + 43.0, jag * 0.9) * restrikeOn * 0.8;
    return (main + (b1 + b2) * 0.42) * flash + restrike;
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

    // cyan-white lightning; each bolt fires rarely (seconds apart ⊕) and
    // cracks briefly. Ambient pair bolts are intentionally sparse.
    vec3 boltCol = vec3(0.62, 0.82, 1.0);
    float b1 = bolt(uv, c1, c2, t, 3.7, 1.0);
    float b2 = bolt(uv, c2, c3, t, 8.2, 1.25);
    float b3 = bolt(uv, c3, c1, t, 14.5, 0.85);
    // pointer arcs charge only while hovering and fire even more rarely
    float bp1 = bolt(uv, c1, cP, t - 0.37, 21.0, 1.1) * uEnergy;
    float bp2 = bolt(uv, c2, cP, t - 0.61, 27.4, 1.2) * uEnergy;
    float bTotal = b1 * 0.95 + b2 * 0.85 + b3 * 0.9 + bp1 * 1.5 + bp2 * 1.3;

    // extinguished channels keep a hot orange ribbon just after a discharge
    float after1 = pow(life(t, 3.7), 0.4) * 0.10;
    float after2 = pow(life(t, 8.2), 0.4) * 0.09;
    float afterP = pow(life(t - 0.37, 21.0), 0.4) * 0.13 * uEnergy;
    vec3 hotCol = vec3(1.0, 0.62, 0.30);
    col += boltCol * bTotal;
    col += hotCol * (after1 + after2 + afterP) * 0.5;

    // violet corona where bolt density is high
    col += vec3(0.36, 0.2, 0.75) * pow(min(bTotal, 1.4), 2.0) * 0.25;

    // incoming arcs lift the cloud base: light the top cloud layer per bolt
    col += vec3(0.07, 0.08, 0.13) * clouds * clamp(b1 + b2 + b3, 0.0, 1.2);

    // click strike: massive vertical discharge at the pointer, decaying;
    // the main channel re-illuminates twice like a real multi-stroke flash
    if (uStrikeTime < 1.2) {
      float strikeAge = uStrikeTime;
      vec2 strikeTop = vec2(pointer.x, uAspect.y);
      float restrokes = 0.0;
      for (int k = 0; k < 2; k++) {
        float ka = float(k) * 0.16;
        restrokes += max(0.0, exp(-abs(strikeAge - ka - 0.08) * 55.0));
      }
      float strike = bolt(uv, strikeTop, pointer, t + strikeAge * 9.0, 55.0 + strikeAge * 40.0, 1.6)
        + channel(uv, strikeTop, pointer, t + strikeAge * 9.0, 71.0 + strikeAge * 60.0, 1.3) * 0.5;
      float flash = exp(-strikeAge * 4.2) + restrokes * 0.45;
      col += vec3(0.85, 0.92, 1.0) * strike * flash * 2.4;
      // whole-sky flash, tighter attack, longer ambient tail
      col += vec3(0.28, 0.33, 0.45) * (exp(-strikeAge * 7.0) + 0.22 * exp(-strikeAge * 1.8)) * 0.5;
      // hot channel ribbon lingers after the strike
      col += hotCol * exp(-strikeAge * 2.6) * 0.35 * clamp(strike, 0.0, 1.0);
    }

    // pointer glow: charged air ionization around the cursor (subtle)
    float pdist = length(vUv - uPointer);
    col += vec3(0.5, 0.72, 1.0) * exp(-pdist * 7.0) * (0.06 + 0.22 * uEnergy);
    // sparks: rare tiny flickers near the cursor (2 Hz bursts, not 24 Hz strobe)
    float sparkPulse = pow(0.5 + 0.5 * sin(t * 12.56 + floor(t) * 7.0), 8.0);
    float sparkField = noise(vUv * 130.0 + floor(t * 12.0));
    float sparks = pow(sparkField, 14.0) * exp(-pdist * 5.0) * (0.25 + uEnergy) * (0.3 + sparkPulse);
    col += vec3(0.8, 0.9, 1.0) * sparks * 0.55;

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
