
(function() {
  const canvas = document.getElementById('hyperspace-canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }) ||
             canvas.getContext('experimental-webgl');
  if (!gl) { document.body.insertAdjacentHTML('beforeend','<p style="position:fixed;inset:0;display:grid;place-items:center;z-index:20">WebGL no está disponible en tu navegador.</p>'); return; }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  window.addEventListener('resize', resize);
  resize();

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("Shader error:", gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error("Program link error:", gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);

  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uSublightTime = gl.getUniformLocation(prog, 'u_sublight_time');
  const uWarpDist = gl.getUniformLocation(prog, 'u_warp_dist');
  const uSpeed = gl.getUniformLocation(prog, 'u_speed');
  const uTunnel = gl.getUniformLocation(prog, 'u_tunnel');
  const uFlash = gl.getUniformLocation(prog, 'u_flash');
  const uSingularity = gl.getUniformLocation(prog, 'u_singularity');

  const btn = document.getElementById('hyperdrive-btn');
  const btnLabel = document.getElementById('btn-label');

  const ENTER_DURATION = 1.2;

  const MAX_STRETCH = 0.18;

  let state = 'sublight';
  let phaseStart = performance.now();
  let phaseTime = 0;
  let speed = 0, warpDist = 0, sublightTime = 0, tunnel = 0, flash = 0, singularity = 0;

  function toggleHyperdrive() {
    if (state === 'sublight' || state === 'exiting') {
      state = 'entering';
      phaseStart = performance.now();
      phaseTime = 0;
      singularity = 0;
      if (btnLabel) btnLabel.textContent = "SALIR DEL HIPERESPACIO";
      if (btn) {
        btn.classList.add('glow-cyan', 'border-cyan-300', 'bg-cyan-950/60');
      }
    } else {
      state = 'exiting';
      phaseStart = performance.now();
      phaseTime = 0;
      flash = 1.0;
      singularity = 0;
      if (btnLabel) btnLabel.textContent = "VELOCIDAD DE LA LUZ";
      if (btn) {
        btn.classList.remove('glow-cyan', 'border-cyan-300', 'bg-cyan-950/60');
      }
    }
  }

  if (btn) {
    btn.addEventListener('click', toggleHyperdrive);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggleHyperdrive(); }
  });

  let lastTime = performance.now();
  let totalTime = 0;

  function render(now) {
    const dt = Math.min((now - lastTime) * 0.001, 0.25);
    lastTime = now;
    totalTime += dt;
    phaseTime = (performance.now() - phaseStart) * 0.001;

    if (state === 'sublight') {
      speed = 0; tunnel = 0; singularity = 0;
      sublightTime += dt;
      warpDist += 18.0 * dt;
      flash = Math.max(0, flash - dt * 2.8);
    }
    else if (state === 'entering') {
      const duration = ENTER_DURATION;
      const progress = Math.min(phaseTime / duration, 1.0);
      const REACH = 1.0;
      const q = Math.min(Math.max(progress / REACH, 0.0), 1.0);

      speed = MAX_STRETCH * (0.08 + 0.92 * q);
      warpDist += (18.0 + Math.pow(progress, 2.0) * 1250.0) * dt;
      tunnel = 0;

      const singStart = duration - 0.2;

      if (phaseTime >= singStart) {
        const sp = Math.min((phaseTime - singStart) / (duration - singStart), 1.0);
        singularity = Math.pow(sp, 2.0) * 2.0;
      } else {
        singularity = 0;
      }

      const flashStart = duration - 0.15;

      if (phaseTime >= flashStart) {
        const fb = Math.min((phaseTime - flashStart) / (duration - flashStart), 1.0);
        flash = Math.pow(fb, 1.3);
      } else {
        flash = Math.max(0, flash - dt * 2.0);
      }

      if (progress >= 1.0) {
        state = 'hyperspace';
        phaseStart = performance.now();
        phaseTime = 0;
        flash = 1.0;
        speed = 0;
        singularity = 0;
        tunnel = 1.0;
      }
    }
    else if (state === 'hyperspace') {
      speed = 0;
      tunnel = 1.0;
      singularity = 0;
      flash = Math.max(0, flash - dt * 4.0);
    }
    else if (state === 'exiting') {
      const exitDuration = 0.65;
      const exitProgress = Math.min(phaseTime / exitDuration, 1.0);
      tunnel = Math.max(0, 1.0 - exitProgress * 1.8);
      speed = Math.max(0, (1.0 - exitProgress) * 0.7);
      singularity = 0;
      warpDist += speed * 900.0 * dt;
      flash = Math.max(0, flash - dt * 2.0);
      if (exitProgress >= 1.0) {
        state = 'sublight';
        speed = 0; tunnel = 0; singularity = 0;
        phaseStart = performance.now();
      }
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, totalTime);
    gl.uniform1f(uSublightTime, sublightTime);
    gl.uniform1f(uWarpDist, warpDist);
    gl.uniform1f(uSpeed, speed);
    gl.uniform1f(uTunnel, tunnel);
    gl.uniform1f(uFlash, flash);
    gl.uniform1f(uSingularity, singularity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();