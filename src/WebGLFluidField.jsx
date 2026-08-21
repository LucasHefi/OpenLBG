import { useEffect, useRef } from 'react';

// Original OpenLBG implementation inspired by the MIT-licensed projects
// WebGL-Fluid-Background and WebGL-Fluid-Simulation. See THIRD_PARTY_NOTICES.md.

const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const ADVECTION_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;
  void main () {
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    outColor = dissipation * texture(uSource, coord);
  }
`;

const SPLAT_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec2 point;
  uniform vec3 color;
  uniform float radius;
  void main () {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    outColor = texture(uTarget, vUv) + vec4(splat, 1.0);
  }
`;

const DIVERGENCE_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float left = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float right = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float bottom = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
    float top = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
    outColor = vec4(0.5 * (right - left + top - bottom), 0.0, 0.0, 1.0);
  }
`;

const CURL_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float left = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
    float right = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
    float bottom = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
    float top = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
    outColor = vec4(0.5 * (right - left - top + bottom), 0.0, 0.0, 1.0);
  }
`;

const VORTICITY_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2 texelSize;
  uniform float curl;
  uniform float dt;
  void main () {
    float left = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
    float right = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
    float bottom = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
    float top = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
    float center = texture(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(top) - abs(bottom), abs(right) - abs(left));
    force /= length(force) + 0.0001;
    force *= curl * center;
    force.y *= -1.0;
    vec2 velocity = texture(uVelocity, vUv).xy + force * dt;
    velocity = min(max(velocity, vec2(-1000.0)), vec2(1000.0));
    outColor = vec4(velocity, 0.0, 1.0);
  }
`;

const PRESSURE_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 texelSize;
  void main () {
    float left = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float right = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float bottom = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float top = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float divergence = texture(uDivergence, vUv).x;
    outColor = vec4((left + right + bottom + top - divergence) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float left = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float right = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float bottom = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float top = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    vec2 velocity = texture(uVelocity, vUv).xy - vec2(right - left, top - bottom);
    outColor = vec4(velocity, 0.0, 1.0);
  }
`;

const DISPLAY_SHADER = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uTexture;
  uniform vec2 texelSize;
  void main () {
    vec3 color = texture(uTexture, vUv).rgb;
    float left = length(texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb);
    float right = length(texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb);
    float bottom = length(texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb);
    float top = length(texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb);
    vec3 normal = normalize(vec3(right - left, top - bottom, 0.22));
    color *= 0.78 + 0.42 * max(dot(normal, normalize(vec3(-0.3, 0.45, 1.0))), 0.0);
    color = pow(max(color, vec3(0.0)), vec3(0.82));
    float alpha = clamp(max(color.r, max(color.g, color.b)) * 1.5, 0.0, 0.94);
    outColor = vec4(color, alpha);
  }
`;

const PALETTE = [
  [0.04, 0.72, 1.0],
  [0.28, 0.22, 1.0],
  [0.78, 0.08, 1.0],
  [1.0, 0.08, 0.46],
  [0.08, 0.94, 0.78],
];

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
    uniforms: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])),
  };
}

export default function WebGLFluidField({ active = true }) {
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
    if (!gl.getExtension('EXT_color_buffer_float')) {
      canvas.dataset.webglFallback = 'poster';
      canvas.dataset.webglReason = 'float-buffer';
      return undefined;
    }

    let frame;
    let velocity;
    let dye;
    let pressure;
    let divergence;
    let curlTarget;
    let lastTime = performance.now();
    let lastAutoSplat = lastTime;
    let colorIndex = 0;
    let pointer = null;
    const splatQueue = [];
    const filtering = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST;

    let programs;
    try {
      programs = {
        advection: createProgram(gl, ADVECTION_SHADER, ['uVelocity', 'uSource', 'texelSize', 'dt', 'dissipation']),
        splat: createProgram(gl, SPLAT_SHADER, ['uTarget', 'aspectRatio', 'point', 'color', 'radius']),
        divergence: createProgram(gl, DIVERGENCE_SHADER, ['uVelocity', 'texelSize']),
        curl: createProgram(gl, CURL_SHADER, ['uVelocity', 'texelSize']),
        vorticity: createProgram(gl, VORTICITY_SHADER, ['uVelocity', 'uCurl', 'texelSize', 'curl', 'dt']),
        pressure: createProgram(gl, PRESSURE_SHADER, ['uPressure', 'uDivergence', 'texelSize']),
        gradient: createProgram(gl, GRADIENT_SHADER, ['uPressure', 'uVelocity', 'texelSize']),
        display: createProgram(gl, DISPLAY_SHADER, ['uTexture', 'texelSize']),
      };
    } catch {
      canvas.dataset.webglFallback = 'poster';
      canvas.dataset.webglReason = 'shader';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return undefined;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const useProgram = (entry) => {
      gl.useProgram(entry.program);
      const location = gl.getAttribLocation(entry.program, 'aPosition');
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    };

    const createFBO = (width, height, filter = filtering) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, fbo, width, height, texelX: 1 / width, texelY: 1 / height };
    };

    const createDoubleFBO = (width, height, filter) => {
      let read = createFBO(width, height, filter);
      let write = createFBO(width, height, filter);
      return {
        get read() { return read; },
        get write() { return write; },
        swap() { [read, write] = [write, read]; },
      };
    };

    const resolution = (base) => {
      const aspect = canvas.width / Math.max(canvas.height, 1);
      return aspect >= 1
        ? { width: Math.round(base * aspect), height: base }
        : { width: base, height: Math.round(base / Math.max(aspect, 0.01)) };
    };

    const blit = (target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo || null);
      gl.viewport(0, 0, target?.width || canvas.width, target?.height || canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const bindTexture = (texture, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    };

    const initFramebuffers = () => {
      const sim = resolution(canvas.width < 500 ? 72 : 104);
      const color = resolution(canvas.width < 500 ? 256 : 420);
      velocity = createDoubleFBO(sim.width, sim.height, filtering);
      dye = createDoubleFBO(color.width, color.height, filtering);
      pressure = createDoubleFBO(sim.width, sim.height, gl.NEAREST);
      divergence = createFBO(sim.width, sim.height, gl.NEAREST);
      curlTarget = createFBO(sim.width, sim.height, gl.NEAREST);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(2, Math.round(rect.width * ratio));
      const height = Math.max(2, Math.round(rect.height * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      initFramebuffers();
    };

    const splat = ({ x, y, dx, dy, color }) => {
      const program = programs.splat;
      useProgram(program);
      gl.uniform1f(program.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(program.uniforms.point, x, 1 - y);
      gl.uniform1f(program.uniforms.radius, 0.0028);

      gl.uniform1i(program.uniforms.uTarget, bindTexture(velocity.read.texture, 0));
      gl.uniform3f(program.uniforms.color, dx, -dy, 0);
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(program.uniforms.uTarget, bindTexture(dye.read.texture, 0));
      gl.uniform3f(program.uniforms.color, color[0] * 0.34, color[1] * 0.34, color[2] * 0.34);
      blit(dye.write);
      dye.swap();
    };

    const step = (dt) => {
      gl.disable(gl.BLEND);
      const simTexel = [velocity.read.texelX, velocity.read.texelY];

      let program = programs.curl;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 0));
      blit(curlTarget);

      program = programs.vorticity;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 0));
      gl.uniform1i(program.uniforms.uCurl, bindTexture(curlTarget.texture, 1));
      gl.uniform1f(program.uniforms.curl, 24);
      gl.uniform1f(program.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();

      program = programs.divergence;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 0));
      blit(divergence);

      program = programs.pressure;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1i(program.uniforms.uDivergence, bindTexture(divergence.texture, 1));
      for (let iteration = 0; iteration < 14; iteration += 1) {
        gl.uniform1i(program.uniforms.uPressure, bindTexture(pressure.read.texture, 0));
        blit(pressure.write);
        pressure.swap();
      }

      program = programs.gradient;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1i(program.uniforms.uPressure, bindTexture(pressure.read.texture, 0));
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 1));
      blit(velocity.write);
      velocity.swap();

      program = programs.advection;
      useProgram(program);
      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1f(program.uniforms.dt, dt);
      gl.uniform1f(program.uniforms.dissipation, 0.985);
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 0));
      gl.uniform1i(program.uniforms.uSource, bindTexture(velocity.read.texture, 1));
      blit(velocity.write);
      velocity.swap();

      gl.uniform2f(program.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform1f(program.uniforms.dissipation, 0.992);
      gl.uniform1i(program.uniforms.uVelocity, bindTexture(velocity.read.texture, 0));
      gl.uniform1i(program.uniforms.uSource, bindTexture(dye.read.texture, 1));
      blit(dye.write);
      dye.swap();
    };

    const render = () => {
      const program = programs.display;
      useProgram(program);
      gl.uniform1i(program.uniforms.uTexture, bindTexture(dye.read.texture, 0));
      gl.uniform2f(program.uniforms.texelSize, dye.read.texelX, dye.read.texelY);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      blit(null);
    };

    const queueSplat = (x, y, dx, dy) => {
      const color = PALETTE[colorIndex % PALETTE.length];
      colorIndex += 1;
      splatQueue.push({ x, y, dx, dy, color });
    };

    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (pointer) queueSplat(x, y, (x - pointer.x) * 3400, (y - pointer.y) * 3400);
      pointer = { x, y };
    };
    const leave = () => { pointer = null; };
    const click = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      queueSplat(x, y, (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 900);
    };

    const draw = (time) => {
      resize();
      const dt = Math.min((time - lastTime) / 1000, 0.0167);
      lastTime = time;
      if (time - lastAutoSplat > 2100) {
        queueSplat(0.18 + Math.random() * 0.64, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 700, (Math.random() - 0.5) * 700);
        lastAutoSplat = time;
      }
      while (splatQueue.length) splat(splatQueue.shift());
      step(dt);
      render();
      frame = requestAnimationFrame(draw);
    };

    resize();
    for (let index = 0; index < 7; index += 1) {
      queueSplat(0.12 + Math.random() * 0.76, 0.15 + Math.random() * 0.7, (Math.random() - 0.5) * 850, (Math.random() - 0.5) * 850);
    }
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

  return <canvas className="particle-field interactive-field interactive-field-fluid" ref={canvasRef} aria-hidden="true" />;
}
