import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 raymarched water caustics field.
// Follows the same WebGL fallback contract as WebGLFluidField: when a context,
// float-buffer or shader is unavailable, the canvas marks itself with
// data-webgl-fallback="poster" and the existing CSS hides it so the static
// poster image shows through.

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const CAUSTICS_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
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
    for (int i = 0; i < 3; i++) {
      sum += amp * noise(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      amp *= 0.5;
    }
    return sum;
  }

  float height(vec2 uv, float t) {
    float h = fbm(uv * 3.1 + vec2(t * 0.06, t * 0.045));
    h += 0.5 * fbm(uv * 6.7 - vec2(t * 0.03, t * 0.05));
    vec2 d = (uv - uPointer) * uAspect;
    float dist = length(d) * 6.0;
    h += 0.16 * sin(dist * 7.0 - t * 2.6) * exp(-dist * 0.55) * uEnergy;
    return h;
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv * uAspect;

    float e = 1.5 / 240.0;
    float h = height(uv, t);
    float hx = height(uv + vec2(e, 0.0), t);
    float hy = height(uv + vec2(0.0, e), t);
    float hxd = height(uv - vec2(e, 0.0), t);
    float hyd = height(uv - vec2(0.0, e), t);
    vec2 grad = vec2(hx - hxd, hy - hyd) / (2.0 * e);

    float caustic = 1.0 / (1.0 + 9.0 * dot(grad, grad));
    caustic = pow(caustic, 2.6);
    caustic += pow(max(0.0, 1.0 - length(grad) * 2.2), 8.0) * 0.55;
    caustic *= 1.35 + 0.65 * h;

    vec3 deep = vec3(0.010, 0.052, 0.076);
    vec3 shallow = vec3(0.16, 0.55, 0.62);
    float depthMix = smoothstep(-0.3, 0.9, h);
    vec3 water = mix(deep, shallow, depthMix * 0.55);

    vec3 causticColor = mix(vec3(0.55, 0.95, 1.0), vec3(0.72, 0.88, 1.0), 0.5 + 0.5 * sin(t * 0.24));
    vec3 color = water + causticColor * caustic * (1.0 + 0.4 * uEnergy);

    vec2 pd = (vUv - uPointer) * uAspect;
    float pdist = length(pd);
    color += vec3(0.35, 0.78, 0.85) * exp(-pdist * 5.5) * (0.14 + 0.38 * uEnergy);
    color += vec3(0.30, 0.16, 0.55) * exp(-pdist * 2.8) * 0.10 * uEnergy;

    float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.35);
    color *= vig * 0.92 + 0.08;

    float alpha = clamp(max(color.r, max(color.g, color.b)) * 1.6, 0.0, 0.93);
    outColor = vec4(color, alpha);
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

export default function CausticsField({ active = true }) {
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
      programs = createProgram(gl, CAUSTICS_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect']);
    } catch {
      canvas.dataset.webglFallback = 'poster';
      canvas.dataset.webglReason = 'shader';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return undefined;
    }

    let frame;
    let width = 0;
    let height = 0;
    let pointer = null;           // raw pointer 0..1, null when off-canvas
    let smooth = { x: 0.5, y: 0.42 };
    let energy = 0;               // smoothed pointer presence 0..1

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

    const draw = (time) => {
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

      // smooth pointer toward raw position (or rest position) and energy toward presence
      const targetX = pointer ? pointer.x : 0.5;
      const targetY = pointer ? pointer.y : 0.42;
      smooth.x += (targetX - smooth.x) * 0.075;
      smooth.y += (targetY - smooth.y) * 0.075;
      energy += ((pointer ? 1 : 0) - energy) * 0.045;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      gl.uniform1f(programs.uniforms.uTime, time / 1000);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(draw);
    };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [active]);

  return <canvas className="particle-field interactive-field interactive-field-caustics" ref={canvasRef} aria-hidden="true" />;
}
