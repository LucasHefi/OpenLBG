import { useEffect, useRef } from 'react';

// Original OpenLBG implementation. WebGL2 aurora shimmer field: layered
// curtain bands with phosphorescent glow, pointer bends the curtains and
// raises their intensity. Same fallback contract as WebGLFluidField /
// CausticsField: data-webgl-fallback="poster" + CSS hides the canvas.

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const AURORA_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;
  uniform vec2 uAspect;

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
      p = p * 2.02 + vec2(11.0, 17.0);
      amp *= 0.5;
    }
    return sum;
  }

  // curtain band intensity for one layer
  float curtain(vec2 uv, float t, float layer, vec2 wind) {
    float x = uv.x + fbm(vec2(uv.y * 2.2 + layer * 7.0, t * 0.09 + layer * 3.1)) * 0.7 - 0.35;
    // vertical falloff: curtains hang from the top and fade toward the horizon
    float band = 0.5 + 0.5 * sin(x * (6.0 + layer * 2.3) + t * (0.32 + layer * 0.12) + layer * 19.0);
    band = pow(band, 2.4);
    float vertical = smoothstep(0.02, 0.28, uv.y) * (1.0 - smoothstep(0.45, 1.0, uv.y));
    return band * vertical;
  }

  void main () {
    float t = uTime;
    vec2 uv = vUv;

    // deep night sky base with subtle star haze
    vec3 sky = mix(vec3(0.012, 0.020, 0.048), vec3(0.035, 0.050, 0.085), uv.y);
    sky += hash(vUv * 480.0) * 0.018; // star dust shimmer

    // pointer influence: local lens that brightens and bends nearby curtains
    vec2 pd = (uv - uPointer) * uAspect;
    float pdist = length(pd);

    vec3 col = sky;
    float layerEnergy[3];
    layerEnergy[0] = 0.62;
    layerEnergy[1] = 0.48;
    layerEnergy[2] = 0.34;

    for (int l = 0; l < 3; l++) {
      float fl = float(l);
      vec2 wind = vec2(t * (0.023 + fl * 0.011), 0.0);
      vec2 bent = uv;
      // pointer pulls the curtain horizontally toward itself
      bent.x += (uPointer.x - uv.x) * exp(-pdist * 3.4) * 0.12 * uEnergy;
      float c = curtain(bent, t, fl, wind);
      c *= layerEnergy[l];

      // color ramp per layer: green -> teal -> violet (classic aurora)
      vec3 tint = l == 0 ? vec3(0.22, 0.95, 0.55)
                : l == 1 ? vec3(0.18, 0.78, 0.92)
                : vec3(0.55, 0.42, 0.95);
      // phosphorescent lower edge
      float edge = smoothstep(0.35, 0.75, uv.y) * smoothstep(1.0, 0.7, uv.y);
      vec3 glow = tint * c * (1.1 + 0.5 * edge);

      // crystalline rays: thin vertical streaks inside the band
      float rays = pow(0.5 + 0.5 * sin(bent.x * 90.0 + t * 0.5 + fl * 7.0), 6.0);
      glow += tint * rays * c * 0.8;

      col += glow;
    }

    // pointer halo mixes aurora light into the sky
    col += vec3(0.30, 0.85, 0.70) * exp(-pdist * 4.5) * (0.06 + 0.22 * uEnergy);
    col += vec3(0.45, 0.35, 0.85) * exp(-pdist * 2.6) * 0.08 * uEnergy;

    // gentle vignette, keep top sky dark
    float vig = smoothstep(1.35, 0.4, length(vUv - vec2(0.5, 0.62)) * 1.25);
    col *= vig * 0.88 + 0.12;

    float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.7, 0.0, 0.95);
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

export default function AuroraField({ active = true }) {
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
      programs = createProgram(gl, AURORA_SHADER, ['uTime', 'uPointer', 'uEnergy', 'uAspect']);
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
    let smooth = { x: 0.5, y: 0.35 };
    let energy = 0;

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

      const targetX = pointer ? pointer.x : 0.5;
      const targetY = pointer ? pointer.y : 0.35;
      smooth.x += (targetX - smooth.x) * 0.06;
      smooth.y += (targetY - smooth.y) * 0.06;
      energy += ((pointer ? 1 : 0) - energy) * 0.038;

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

  return <canvas className="particle-field interactive-field interactive-field-aurora" ref={canvasRef} aria-hidden="true" />;
}
