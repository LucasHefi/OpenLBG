import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 neon circuit field: a dark PCB
// substrate with procedurally routed copper traces; glowing energy pulses
// travel the traces continuously, the pointer attracts pulses and lights
// the traces under it, a click emits a charge burst that floods the board
// outward. Fallback contract identical to the other WebGL fields
// (data-webgl-fallback="poster" + CSS hides the canvas).

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const CIRCUIT_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;
  uniform float uSurgeTime;   // seconds since last click, large = none

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash1(float n) { return fract(sin(n) * 43758.5453); }

  // grid-space cell: each cell picks a horizontal/vertical route at its
  // origin so traces look like Manhattan-routed PCB copper
  vec2 routeDir(vec2 cell) {
    float r = hash(cell * 0.618 + 3.1);
    return r < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  }

  // distance of point uv to the routed trace passing through a cell.
  // The route: enter at cell edge, run axis-aligned, exit at a random edge
  float traceDist(vec2 uv, vec2 cellId, float scale) {
    vec2 dir = routeDir(cellId);
    // trace center: axis-aligned line through the cell with a lateral offset
    float lateralOff = (hash(cellId * 1.71 + 9.2) - 0.5) * 0.72;
    // axis coordinate along the route direction is continuous across cells:
    float axis = dir.x > 0.5 ? uv.y : uv.x;
    float cross = dir.x > 0.5 ? uv.x - cellId.x : uv.y - cellId.y;
    float centerAxis = (dir.x > 0.5 ? cellId.y : cellId.x) + lateralOff;
    return abs(axis - centerAxis);
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv * uAspect;
    vec2 pointer = uPointer * uAspect;

    // ---- substrate ----
    vec3 panel = vec3(0.014, 0.020, 0.026);
    // subtle grid pattern
    vec2 grid = uv * 52.0;
    vec2 gline = abs(fract(grid) - 0.5);
    float gridFade = exp(-min(gline.x, gline.y) * 42.0);
    panel += vec3(0.05, 0.10, 0.09) * gridFade * 0.16;

    // ---- routed copper traces (two scales for depth) ----
    float scale1 = 52.0;
    float scale2 = 122.0;
    float best1 = 1.0;
    float best2 = 1.0;
    // check the 3x3 neighborhood of cells so traces crossing cell borders read continuous
    vec2 base1 = floor(uv * scale1);
    vec2 base2 = floor(uv * scale2);
    // trace mask via lateral distance in each neighbor cell; keep nearest
    float d1 = 1.0;
    float d2 = 1.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 off = vec2(float(ox), float(oy));
        d1 = min(d1, traceDist(uv * scale1, base1 + off, scale1));
        d2 = min(d2, traceDist(uv * scale2, base2 + off, scale2));
      }
    }
    // copper body: faint greenish metal, visible sharply only near the pointer
    float copper1 = smoothstep(0.09, 0.015, d1);
    float copper2 = smoothstep(0.20, 0.04, d2);
    panel += vec3(0.055, 0.26, 0.19) * copper1 * 0.30;
    panel += vec3(0.035, 0.16, 0.12) * copper2 * 0.20;

    // ---- energy pulses travelling the traces ----
    // each cell hosts a pulse: a glowing dot riding the line, with per-cell
    // speed/phase; pulses render as comet streaks along their axis
    float pulses = 0.0;
    float pulseDir = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 cellId = base1 + vec2(float(ox), float(oy));
        vec2 dir = routeDir(cellId);
        float speed = 0.25 + hash(cellId * 2.13 + 4.4) * 0.9;
        float phaseIn = fract(hash(cellId * 4.77 + 12.0) * 10.0 + t * speed);
        // position of pulse center along the axis in cell-units
        float axisPos = phaseIn * 3.0 - 1.0 + (dir.x > 0.5 ? cellId.y : cellId.x);
        float axis = dir.x > 0.5 ? uv.y : uv.x;
        float headDist = length(vec2(dir.x > 0.5 ? axis - axisPos : (uv.x - cellId.x - 0.5), dir.x > 0.5 ? (uv.y - cellId.y - 0.5) * (uv.y - cellId.y - 0.5) * 4.0 - 0.02 : axis - axisPos));
        // simpler: measure along-axis distance and cross-axis distance
        float cross = dir.x > 0.5 ? abs(uv.x - (cellId.x + 0.5 + (hash(cellId * 1.71 + 9.2) - 0.5) * 0.72)) : abs(uv.y - (cellId.y + 0.5 + (hash(cellId * 1.71 + 9.2) - 0.5) * 0.72));
        float along = axis - axisPos;
        // comet: bright head, exponential tail behind the head
        float tail = exp(-max(along * (dir.x > 0.5 ? 1.0 : 1.0), 0.0) * 8.0) + exp(-abs(along) * 30.0);
        float body = exp(-cross * cross * scale1 * scale1 * 0.045) * tail;
        if (body > 0.0) { pulses = max(pulses, body); pulseDir = dir.x; }
      }
    }

    // ---- pointer interaction ----
    float pdist = length(uv - pointer);
    // proximity lighting: traces under the pointer come alive
    float local = exp(-pdist * 3.0) * (0.25 + 0.75 * uEnergy);
    panel += vec3(0.07, 0.45, 0.33) * copper1 * local;
    panel += vec3(0.04, 0.28, 0.20) * copper2 * local;

    // click surge: expanding hexagonal-ish charge wave over the board
    float surge = 0.0;
    if (uSurgeTime >= 0.0 && uSurgeTime < 2.2) {
      float waveR = uSurgeTime * 1.15;
      float waveW = 0.03 + uSurgeTime * 0.08;
      float waveFront = exp(-abs(pdist - waveR) / waveW * (waveW * 8.0 + 2.0));
      surge = waveFront * exp(-uSurgeTime * 1.7);
    }
    // ---- final color ----
    vec3 neonA = vec3(0.30, 1.0, 0.65);   // mint green energy
    vec3 neonB = vec3(0.55, 0.85, 1.0);   // cool cyan edge
    vec3 col = panel;
    // pulses glow on copper both scales
    col += neonA * pulses * (0.55 + local * 0.7 + surge * 1.4);
    col += neonB * pulses * 0.18;
    // surge highlight runs over copper
    col += neonA * copper1 * surge * (0.9 + 0.5 * hash(floor(uv * 60.0) + floor(uSurgeTime * 30.0)));
    col += vec3(1.0, 1.0, 1.0) * surge * copper1 * 0.35;

    // vignette
    float vig = smoothstep(1.28, 0.4, length(vUv - vec2(0.5, 0.52)) * 1.28);
    col *= vig * 0.94 + 0.06;

    float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.75, 0.0, 0.95);
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

export default function CircuitField({ active = true }) {
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
      programs = createProgram(gl, CIRCUIT_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uSurgeTime']);
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
    let surgeStart = -10;

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
    const click = () => { surgeStart = performance.now() / 1000; };

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
      smooth.x += (targetX - smooth.x) * 0.08;
      smooth.y += (targetY - smooth.y) * 0.08;
      energy += ((pointer ? 1 : 0) - energy) * 0.05;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uSurgeTime, timeSec - surgeStart);
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

  return <canvas className="particle-field interactive-field interactive-field-circuit" ref={canvasRef} aria-hidden="true" />;
}
