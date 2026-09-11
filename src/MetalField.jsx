import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 metallic liquid metal field:
// a dark reflective mercury-like surface driven by a heightfield; pointer
// dents the surface, concentric ripples reflect studio-light bands, clicks
// drop a heavy droplet wave. Fallback contract identical to the other
// WebGL fields (data-webgl-fallback="poster" + CSS hides the canvas).

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const METAL_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;
  uniform float uDropTime;   // seconds since last click, large = none

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
      p = p * 2.05 + vec2(13.0, 7.0);
      amp *= 0.5;
    }
    return sum;
  }

  // metal surface height
  float surface(vec2 uv, float t) {
    vec2 flow = vec2(t * 0.045, t * 0.031);
    float h = fbm(uv * 2.6 + flow) - 0.5;
    h += 0.55 * (fbm(uv * 5.9 - flow * 1.6) - 0.5);
    // gentle swell so the reflection bands crawl even without input
    h += 0.08 * sin(uv.x * 7.0 + t * 0.5) * sin(uv.y * 5.0 - t * 0.37);
    return h;
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv;

    // pointer dent: surface pushed down around the cursor
    vec2 pd = (uv - uPointer) * uAspect;
    float pdist = length(pd);
    float dent = exp(-pdist * pdist * 26.0) * (0.55 * uEnergy);
    // ripple wake trailing the pointer motion intensity
    float wake = sin(pdist * 34.0 - t * 3.2) * exp(-pdist * 6.0) * 0.10 * uEnergy;

    // click droplet: heavy expanding ring wave
    float wave = 0.0;
    if (uDropTime < 1.8) {
      float ring = pdist * 22.0 - uDropTime * 7.0;
      wave = sin(ring) / (1.0 + ring * ring) * exp(-uDropTime * 1.6) * 0.5;
    }

    float e = 1.6 / 300.0;
    float h0 = surface(uv, t) - dent + wake + wave;
    float hx = surface(uv + vec2(e, 0.0), t) - dent * exp(-pow((uv.x + e - uPointer.x) * uAspect.x * 5.1, 2.0)) + wake + wave;
    float hy = surface(uv + vec2(0.0, e), t) + wake + wave;
    float hxd = surface(uv - vec2(e, 0.0), t) + wake + wave;
    float hyd = surface(uv - vec2(0.0, e), t) + wake + wave;
    vec3 normal = normalize(vec3((hxd - hx) / (2.0 * e), (hyd - hy) / (2.0 * e), 0.42));

    // studio environment: two overhead softbox bands + one cool rim light
    vec3 viewDir = normalize(vec3(0.0, -0.35, 1.0));
    vec3 reflectDir = reflect(-viewDir, normal);

    vec3 col = vec3(0.016, 0.017, 0.021); // near-black base

    // stretched bands: reflection of long softboxes across the rippled surface
    float bandR = pow(clamp(1.0 - abs(reflectDir.y - 0.55) * 2.2, 0.0, 1.0), 5.0);
    float bandW = pow(clamp(1.0 - abs(reflectDir.y - 0.78) * 3.4, 0.0, 1.0), 7.0);
    // horizontal streak modulation so bands break under ripples
    float streak = 0.62 + 0.38 * sin(reflectDir.x * 26.0 + t * 0.35);
    streak *= 0.72 + 0.28 * fbm(reflectDir.xy * 22.0 + t * 0.12);

    // metal palette: warm champagne band + cool steel band, dark B2B restrained
    col += vec3(0.86, 0.72, 0.48) * bandR * streak * 0.85;
    col += vec3(0.62, 0.74, 0.86) * bandW * streak * 0.7;

    // fresnel edge sheen: more reflective toward grazing angles
    float fresnel = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.6);
    col += vec3(0.30, 0.34, 0.40) * fresnel * 0.55;

    // pointer proximity: molten highlight that heats the reflection locally
    float hot = exp(-pdist * 3.4) * (0.10 + 0.30 * uEnergy);
    col += vec3(0.95, 0.86, 0.72) * hot * (0.35 + bandR * streak);

    // click shock glint: brief bright iris at the wave crest
    if (uDropTime < 0.55) {
      float crest = exp(-abs(pdist - uDropTime * 0.30) * 26.0);
      col += vec3(1.0, 0.97, 0.9) * crest * exp(-uDropTime * 4.5) * 0.6;
    }

    // vignette
    float vig = smoothstep(1.28, 0.38, length(vUv - 0.5) * 1.32);
    col *= vig * 0.9 + 0.1;

    float lum = max(col.r, max(col.g, col.b));
    float alpha = clamp(lum * 1.7 + fresnel * 0.3, 0.0, 0.96);
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

export default function MetalField({ active = true }) {
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
      programs = createProgram(gl, METAL_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect', 'uDropTime']);
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
    let dropStart = -10;

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
    const click = () => { dropStart = performance.now() / 1000; };

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
      smooth.x += (targetX - smooth.x) * 0.07;
      smooth.y += (targetY - smooth.y) * 0.07;
      energy += ((pointer ? 1 : 0) - energy) * 0.04;

      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.program);
      const timeSec = timeMs / 1000;
      gl.uniform1f(programs.uniforms.uTime, timeSec);
      gl.uniform2f(programs.uniforms.uPointer, smooth.x, 1 - smooth.y);
      gl.uniform1f(programs.uniforms.uEnergy, energy);
      gl.uniform2f(programs.uniforms.uAspect, Math.max(width / Math.max(height, 1), 1), 1);
      gl.uniform1f(programs.uniforms.uDropTime, timeSec - dropStart);
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

  return <canvas className="particle-field interactive-field interactive-field-metal" ref={canvasRef} aria-hidden="true" />;
}
