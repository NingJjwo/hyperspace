const vsSource = `
  attribute vec2 a_pos;

  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const fsSource = `
  precision highp float;

  uniform vec2 u_res;
  uniform float u_time;
  uniform float u_sublight_time;
  uniform float u_warp_dist;
  uniform float u_speed;
  uniform float u_tunnel;
  uniform float u_flash;
  uniform float u_singularity;

  const float MAX_STRETCH = 0.18;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    mat2 rot = mat2(0.866, 0.5, -0.5, 0.866);

    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.05 + vec2(1.7, 3.2);
      a *= 0.5;
    }

    return v;
  }

  float fluidVortex(vec2 p, float t) {
    vec2 q = vec2(
      fbm(p + vec2(0.0, t * 1.6)),
      fbm(p + vec2(4.3, t * 1.9))
    );

    vec2 r = vec2(
      fbm(p + 1.7 * q + vec2(1.7, t * 1.3)),
      fbm(p + 1.7 * q + vec2(8.3, t * 1.0))
    );

    return fbm(p + 2.0 * r);
  }

  float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float vortexField(float ang, float depth, float t) {
    float twist = ang + depth * 0.18 + t * 0.5;
    vec2 tunnelUV = vec2(twist * 1.5, depth * 0.45 - t * 5.2);
    float f1 = fluidVortex(tunnelUV, t * 1.6);
    float f2 = fluidVortex(tunnelUV * 1.8 + vec2(1.3, -t * 2.1), t * 2.2);
    return mix(f1, f2, 0.48);
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 center = 0.5 * u_res;
    vec2 uvPix = fragCoord - center;
    float rPix = length(uvPix);
    float angle = atan(uvPix.y, uvPix.x);
    vec3 col = vec3(0.0);

    if (u_tunnel < 0.999) {
      vec3 starAccum = vec3(0.0);
      float maxRadius = length(center) * 1.25;

      const float NUM_SECTORS = 340.0;
      const float TWO_PI = 6.283185307;
      float sectorAngle = TWO_PI / NUM_SECTORS;
      float sectorF = angle / sectorAngle;
      float baseSector = floor(sectorF);

      for (int sOff = -3; sOff <= 3; sOff++) {
        float sIdx = mod(baseSector + float(sOff), NUM_SECTORS);

        for (int k = 0; k < 8; k++) {
          vec2 starSeed = vec2(sIdx, float(k) * 23.47);
          vec2 rnd = hash22(starSeed);
          vec2 rnd2 = hash22(starSeed + vec2(53.2, 91.7));

          float th = (sIdx + rnd.x) * sectorAngle;
          vec2 starDir = vec2(cos(th), sin(th));
          vec2 perp = vec2(-starDir.y, starDir.x);

          float rMin = 8.0;
          float rMax = maxRadius;
          float rSpan = rMax - rMin;
          float baseOffset = rnd.y * rSpan;
          float scatter = (rnd2.x - 0.5) * 18.0;

          float travel = mod(baseOffset + u_warp_dist * (1.0 + rnd2.x * 0.8), rSpan);
          float headDist = rMin + travel + abs(scatter) * 0.15;

          float twSpeed = 1.0 + 3.0 * rnd2.x;
          float twPhase = rnd2.y * 6.28;
          float twinkle = sin(u_sublight_time * twSpeed + twPhase) * sin(u_sublight_time * 0.7 * twSpeed + twPhase * 1.3);
          twinkle = 0.8 + 0.2 * twinkle;

          float brightness = 0.7 + 0.45 * rnd2.x;
          if (rnd2.y > 0.88) brightness *= 1.25;

          float normR = (headDist - rMin) / rSpan;
          float depthFade = smoothstep(0.0, 0.12, normR) * smoothstep(1.0, 0.82, normR);

          vec2 starPos = starDir * headDist + perp * scatter;
          float d = length(uvPix - starPos);
          float core = smoothstep(1.15, 0.0, d);
          float glow = smoothstep(2.2, 0.0, d) * 0.25;
          float starVal = (core + glow) * brightness * twinkle * depthFade;
          vec3 starCol = mix(vec3(0.95, 0.98, 1.0), vec3(1.0, 0.99, 0.95), rnd2.y);

          float keep = hash12(starSeed + vec2(7.7, 3.1));
          float longS = step(keep, 0.38);
          float ext = mix(0.25, 1.0, longS) * (0.6 + 0.8 * rnd2.y);
          float headEff = headDist * (1.0 + u_speed * 1.8 * ext);
          float tailEff = max(headDist * (1.0 - u_speed * 0.22 * (0.5 + rnd2.x)), rMin);

          vec2 pHead = starDir * headEff + perp * scatter;
          vec2 pTail = starDir * tailEff + perp * scatter;
          float dLine = distToSegment(uvPix, pTail, pHead);

          float rp = max(dot(uvPix, starDir), 0.0);
          float tS = smoothstep(0.0, 0.045, u_speed);
          float w = mix(1.25, 0.7 + 0.0045 * rp, tS);
          float coreLine = smoothstep(w, 0.0, dLine);
          float haloLine = pow(smoothstep(w * 3.2, 0.0, dLine), 1.5);

          float proj = clamp(dot(uvPix - pTail, pHead - pTail) / max(dot(pHead - pTail, pHead - pTail), 0.0001), 0.0, 1.0);
          float headBoost = 0.6 + 0.4 * smoothstep(0.0, 0.35, proj);
          float fadeS = mix(depthFade, smoothstep(0.0, 0.2, normR) * smoothstep(1.0, 0.9, normR), tS);

          vec3 edgeBlue = vec3(0.05, 0.38, 1.00);
          vec3 coreCol = mix(vec3(0.55, 0.95, 1.00), vec3(0.80, 1.00, 0.90), rnd2.x);
          vec3 coreLow = mix(vec3(0.95, 0.98, 1.0), coreCol, tS);
          vec3 streakCol = edgeBlue * haloLine * 1.2 * tS + coreLow * coreLine * 1.25;
          streakCol *= brightness * mix(twinkle, 1.0, tS) * headBoost * fadeS * (1.0 + u_speed * 0.42);

          float blend = smoothstep(0.0, 0.045, u_speed);
          vec3 finalStar = mix(starCol * starVal, streakCol, blend);
          starAccum += finalStar;
        }
      }

      col += starAccum * (1.0 - u_tunnel);
    }

    if (u_tunnel > 0.001) {
      vec2 normUV = uvPix / u_res.y;
      float rNorm = length(normUV);
      float depth = 1.0 / max(rNorm, 0.001);
      float t = u_time * 1.9;

      float vortex = vortexField(angle, depth, t);
      float wSeam = 0.5 * smoothstep(3.14159265 - 0.7, 3.14159265, abs(angle));
      if (wSeam > 0.0) {
        float angB = angle - sign(angle) * 6.28318531;
        vortex = mix(vortex, vortexField(angB, depth, t), wSeam);
      }

      float ta = angle + depth * 0.18 + t * 0.5;
      vec2 pc = vec2(cos(ta), sin(ta)) * 1.3 + vec2(depth * 0.10 - t * 1.1, depth * 0.06);
      float cloudMask = 0.65 * noise(pc) + 0.35 * noise(pc * 2.4 + vec2(5.2, 1.3));
      float darkAmt = 1.0 - smoothstep(0.30, 0.52, cloudMask);
      float hazeAmt = smoothstep(0.55, 0.78, cloudMask);
      float softV = 0.40 + 0.35 * cloudMask;
      vortex = mix(vortex, softV, hazeAmt * 0.75);
      vortex *= 1.0 - 0.45 * darkAmt;

      vec3 deepNavy = vec3(0.01, 0.04, 0.32);
      vec3 royalBlue = vec3(0.03, 0.25, 0.92);
      vec3 skyBlue = vec3(0.16, 0.58, 1.00);
      vec3 paleBlue = vec3(0.66, 0.88, 1.00);
      vec3 coreWhite = vec3(1.0);
      vec3 glowBlue = vec3(0.30, 0.70, 1.00);

      vec3 tunCol = mix(deepNavy, royalBlue, smoothstep(0.08, 0.38, vortex));
      tunCol = mix(tunCol, skyBlue, smoothstep(0.38, 0.72, vortex));
      tunCol = mix(tunCol, paleBlue, smoothstep(0.74, 0.94, vortex));
      tunCol += coreWhite * pow(vortex, 4.0) * 0.8;

      float centerGlow = exp(-rNorm * 5.8);
      tunCol += glowBlue * centerGlow * 1.7;
      tunCol += coreWhite * exp(-rNorm * 12.0) * 2.4;

      float rays = sin(angle * 26.0 + vortex * 7.0 + t * 9.0) * 0.5 + 0.5;
      tunCol += skyBlue * rays * 0.16 * smoothstep(0.08, 0.75, rNorm);
      tunCol *= smoothstep(1.35, 0.35, rNorm);

      col = mix(col, tunCol, u_tunnel);
    }

    if (u_singularity > 0.001) {
      float singR = rPix;
      float singCore = smoothstep(10.0 * (0.8 + 0.5 * u_singularity), 0.0, singR);
      float singMid = exp(-singR / (32.0 + 45.0 * u_singularity));
      float singOuter = exp(-singR / (110.0 + 160.0 * u_singularity));
      float singPulse = 0.88 + 0.22 * sin(u_time * 38.0);
      vec3 singColor = vec3(1.0) * (singCore * 3.5 + singMid * 2.0);
      vec3 cyanGaze = vec3(0.40, 0.80, 1.0) * (singMid * 1.5 + singOuter * 0.9);
      col += (singColor + cyanGaze) * u_singularity * singPulse;
    }

    if (u_flash > 0.001) {
      vec3 fullScreenFlash = mix(vec3(0.85, 0.94, 1.0), vec3(1.0), clamp(u_flash * 1.2, 0.0, 1.0));
      col = mix(col, fullScreenFlash * 2.2, clamp(u_flash, 0.0, 1.0));
    }

    col = 1.0 - exp(-col * 1.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;