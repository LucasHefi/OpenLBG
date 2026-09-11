import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 GPU particle nebula:
// thousands of instanced gl.POINTS orbit a fractal attractor field; the
// pointer warps the flow, a click releases a gravitational pulse. Fallback
// contract identical to the other WebGL fields.

const VERTEX_SHADER = `#version 300 es
  in float aSeed;         // per-particle static seed
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;   // hover strength 0..1
  uniform vec2 uAspect;    // width/height correction
  uniform float uPulseTime;   // seconds since pulse start, <0 = none
  uniform vec2 uPulseOrigin;
  out float vSize;
  out float vSeed;
  out vec3 vColor;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main () {
    float s1 = hash(aSeed * 53.0);
    float s2 = hash(aSeed * 97.0 + 1.0);
    float s3 = hash(aSeed * 131.0 + 2.0);
    float s4 = hash(aSeed * 179.0 + 3.0);

    // base orbit: each particle circles one of 4 virtual attractor centers
    vec2 anchor = vec2(
      0.22 + 0.56 * fract(s3 * 2.0),
      0.24 + 0.52 * fract(s4 * 2.0)
    );
    float radius = 0.05 + s1 * 0.44;
    float speed = (0.05 + s2 * 0.14) * (fract(s3 * 4.0) > 0.5 ? 1.0 : -1.0);
    float phase = s1 * 6.2831 + uTime * speed;
    vec2 pos = anchor + vec2(cos(phase), sin(phase) * 0.72) * radius;

    // pointer warp: swirl particles around the cursor
    vec2 d = (pos - uPointer) * uAspect;
    float dist = length(d) + 0.0001;
    float warp = exp(-dist * 4.2) * 0.10 * uEnergy;
    pos += normalize(d.yx * vec2(-1.0, 1.0)) * warp;

    // gravitational pulse from click: outward radial kick that decays
    if (uPulseTime >= 0.0 && uPulseTime < 1.4) {
      float wave = sin(dist * 18.0 - uPulseTime * 9.0) * exp(-dist * 3.0) * exp(-uPulseTime * 2.2);
      pos += normalize(d + vec2(0.0001)) * wave * 0.05;
    }

    // depth-ish parallax: bigger/slower particles sit "closer" to camera
    float depth = 0.35 + s2 * 0.65;
    vSize = (1.1 + s4 * 2.6) * depth;
    vSeed = aSeed;

    // color: palette from deep blue through cyan-magenta with warm accents
    vec3 colA = vec3(0.35, 0.55, 1.0);
    vec3 colB = vec3(0.75, 0.35, 0.95);
    vec3 colC = vec3(1.0, 0.62, 0.42);
    float mixSel = fract(s3 * 7.0);
    vColor = mixSel < 0.55 ? mix(colA, colB, s2)
           : mixSel < 0.88 ? colB
           : colC;

    gl_Position = vec4(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  in float vSize;
  in float vSeed;
  in vec3 vColor;
  out vec4 outColor;
  void main () {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float glow = pow(1.0 - r, 2.0) * 0.85 + 0.12;
    outColor = vec4(vColor * glow, clamp(glow, 0.0, 0.9));
  }
`;

function createProgram(gl, vertexSource, fragmentSource, uniformsList) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return { program, uniforms: Object.fromEntries(uniformsList.map((n) => [n, gl.getUniformLocation(program, n)])) };
}

export default function NebulaField({ active = true }) {
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

    const COUNT = 4000;
    let programs;
    try {
      programs = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uPulseTime', 'uPulseOrigin']);
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
    let pulseStart = -10; // seconds in uTime domain

    // static seed buffer
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) seeds[i] = (i + 1.7) / COUNT;
    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const seedLocation = gl.getAttribLocation(programs.program, 'aSeed');
    gl.enableVertexAttribArray(seedLocation);
    gl.vertexAttribPointer(seedLocation, 1, gl.FLOAT, false, 0, 0);

    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer = {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      };
    };
    const leave = () => { pointer = null; };
    const click = () => { pulseStart = performance.now() / 1000; };

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
      smooth.x += (targetX - smooth.x) * 0.085;
      smooth.y += (targetY - smooth.y) * 0.085;
      energy += ((pointer ? 1 : 0) - energy) * 0.05;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uPulseTime, timeSec - pulseStart);
      gl.uniform2f(programs.uniforms.uPulseOrigin, smooth.x, 1 - smooth.y);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // one instance, COUNT points: each vertex shader invocation draws one particle
      gl.drawArrays(gl.POINTS, 0, COUNT);
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

  return <canvas className="particle-field interactive-field interactive-field-nebula" ref={canvasRef} aria-hidden="true" />;
}
