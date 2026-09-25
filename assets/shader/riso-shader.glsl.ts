// ──────────────────────────────────────────────────────────────────────────
// Riso Shader GLSL (WebGL2 / GLSL ES 3.00). Same source as riso-reel.html:
// if you edit one, mirror the other (the HTML stays a single self-contained file).
//
//   VERT        fullscreen triangle from gl_VertexID (bind an empty VAO)
//   SCENE_FRAG  pass 1: ray-trace spheres + plane into ONE tone channel
//               (0 = ink, 0.5 = spot, 1 = paper). Render into an R8 texture.
//   POST_FRAG   pass 2: tone -> ink/spot separations -> rotated dot screens,
//               per-plate misregistration, grain, vignette over paper.
//
// Sphere data lives in a std140 uniform block "Spheres" (binding 0):
//   vec4 uSph[160]  xyz = centre, w = radius
//   vec4 uMat[160]  x = tone, y = specular, z = reflectivity, w = 1 if not a shadow caster
// ──────────────────────────────────────────────────────────────────────────

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp int;
#define MAXS 160
layout(std140) uniform Spheres { vec4 uSph[MAXS]; vec4 uMat[MAXS]; };
uniform int uCount;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
uniform vec3 uLight;
uniform float uSunSize, uTime, uGloss, uFog, uSwirl, uSwirlRot, uVortex, uTwist, uSpin, uArms, uRings, uRingPhase, uCollapse;
uniform vec2 uVC;
uniform vec4 uRip[12];
uniform int uRipCount, uBounces, uReflShadows;
out vec4 fragColor;

const float TAU = 6.28318530718;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float iSphere(vec3 ro, vec3 rd, vec4 s) {
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd), c = dot(oc, oc) - s.w * s.w, h = b * b - c;
  if (h < 0.0) return -1.0;
  return -b - sqrt(h);
}

// Soft shadow toward a directional light with angular radius uSunSize.
float shadow(vec3 p, int skip) {
  float s = 1.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    if (i == skip || uMat[i].w > 0.5) continue;
    vec4 sp = uSph[i];
    vec3 oc = sp.xyz - p;
    float tc = dot(oc, uLight);
    if (tc <= 0.0) continue;
    float dl = sqrt(max(dot(oc, oc) - tc * tc, 0.0)) - sp.w;
    s *= smoothstep(-uSunSize, uSunSize, dl / tc);
    if (s < 0.01) break;
  }
  return s;
}

// Shadow + analytic sphere occlusion for plane points, one loop.
void lightPlane(vec3 p, vec3 n, out float sh, out float ao) {
  sh = 1.0; ao = 1.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    if (uMat[i].w > 0.5) continue;
    vec4 sp = uSph[i];
    vec3 oc = sp.xyz - p;
    float l2 = dot(oc, oc);
    float k = sp.w * sp.w / l2;
    ao *= 1.0 - max(dot(n, oc) * inversesqrt(l2), 0.0) * k * sqrt(k);   // tight contact AO
    float tc = dot(oc, uLight);
    if (tc > 0.0) {
      float dl = sqrt(max(l2 - tc * tc, 0.0)) - sp.w;
      sh *= smoothstep(-uSunSize, uSunSize, dl / tc);
    }
  }
}

float liquid(vec2 p) {
  vec2 d = p - uVC;
  vec2 q = rot(uSwirlRot / (1.0 + 0.12 * dot(d, d))) * d * 0.55;
  float t = uTime;
  q += 0.7 * vec2(sin(q.y * 1.3 + t * 0.9), sin(q.x * 1.1 - t * 0.8));
  float h = sin(q.x * 1.9 + t * 1.1) * cos(q.y * 1.6 - t * 0.7);
  q = mat2(0.8, -0.6, 0.6, 0.8) * q * 2.1;
  q += 0.5 * vec2(sin(q.y * 1.2 - t * 1.4), sin(q.x * 1.5 + t * 1.2));
  h += 0.5 * sin(q.x * 1.4 - t * 1.3) * cos(q.y * 1.9 + t * 0.9);
  return h;
}

float ripples(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uRipCount) break;
    vec4 r = uRip[i];                       // xy = centre, z = age (s), w = amplitude
    float x = length(p - r.xy) - r.z * 2.4;
    h += r.w * exp(-r.z * 1.2) * exp(-x * x * 2.5) * sin(x * 10.0);
  }
  return h;
}

float heightAt(vec2 p) {
  float h = 0.0;
  if (uSwirl > 0.001) h += uSwirl * 0.34 * liquid(p);
  if (uRipCount > 0) h += 0.035 * ripples(p);
  return h;
}

vec3 planeNormal(vec2 p) {
  if (uSwirl <= 0.001 && uRipCount == 0) return vec3(0.0, 1.0, 0.0);
  const float e = 0.02;
  float h = heightAt(p);
  return normalize(vec3(-(heightAt(p + vec2(e, 0.0)) - h) / e, 1.0, -(heightAt(p + vec2(0.0, e)) - h) / e));
}

// Alternating ink / paper band with a hard leading edge and a screened tail.
float band(float u) {
  float k = floor(u), f = u - k;
  float ink = mod(k, 2.0) < 0.5 ? 0.0 : 1.0;
  return mix(ink, 0.5, smoothstep(0.0, 0.42, f));
}
// Spiral arms around uVC, cross-fading into concentric rings that collapse inward.
float vortexTone(vec2 p, float base) {
  if (uVortex <= 0.001) return base;
  vec2 d = p - uVC;
  float r = max(length(d), 1e-3);
  float spiral = band(atan(d.y, d.x) / TAU * uArms + uTwist * log(r) / TAU - uSpin);
  float rings = band(3.0 * log(r) + uRingPhase);
  float t = mix(spiral, rings, uRings);
  float reach = 0.6 * pow(28.0, 1.0 - uCollapse);              // bands vanish outside-in
  float amp = uVortex * smoothstep(0.15, 0.9, r) * (1.0 - smoothstep(reach - 1.5, reach, r));
  return mix(base, t, amp);
}

float shadePlane(vec3 p, vec3 n, bool doShadow) {
  float t = vortexTone(p.xz, 0.5);
  float sh = 1.0, ao = 1.0;
  if (doShadow) lightPlane(p + n * 1e-3, n, sh, ao);
  float diff = clamp(dot(n, uLight) / uLight.y, 0.0, 1.5);
  return t * mix(0.04, 1.0, sh * ao) * mix(1.0, diff * diff, 0.9);
}

float shadeSphere(int i, vec3 p, vec3 n, vec3 rd, bool doShadow, out float spec) {
  vec4 m = uMat[i];
  float sh = doShadow ? shadow(p + n * 1e-3, i) : 1.0;
  float diff = max(dot(n, uLight), 0.0) * sh;
  float t = m.x;
  if (m.x > 0.1 && m.x < 0.9) t = m.x * (0.25 + 0.85 * diff);   // spot-ink sphere: shaded
  spec = m.y * pow(max(dot(reflect(rd, n), uLight), 0.0), 70.0) * sh * 1.8;
  return t;
}

// id: -2 sky, -1 plane, >= 0 sphere
float trace(vec3 ro, vec3 rd, out int id) {
  float tm = 1e5; id = -2;
  if (rd.y < -1e-4) { float tp = -ro.y / rd.y; if (tp > 0.0) { tm = tp; id = -1; } }
  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    float t = iSphere(ro, rd, uSph[i]);
    if (t > 1e-3 && t < tm) { tm = t; id = i; }
  }
  return tm;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamFwd + uTanHalf * (uv.x * uCamRight + uv.y * uCamUp));
  float acc = 0.0, w = 1.0, firstT = 1e5;
  int firstId = -2;
  for (int b = 0; b < 3; b++) {
    if (b > uBounces) break;
    bool doSh = b == 0 || uReflShadows == 1;
    int id;
    float t = trace(ro, rd, id);
    if (b == 0) { firstT = t; firstId = id; }
    if (id == -2) { acc += w; break; }                      // sky = bare paper
    vec3 p = ro + rd * t;
    vec3 n;
    float local, spec = 0.0, refl;
    if (id == -1) {
      n = planeNormal(p.xz);
      local = shadePlane(p, n, doSh);
      refl = uGloss * (0.06 + 0.94 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0));
    } else {
      vec4 s = uSph[id];
      n = (p - s.xyz) / s.w;
      local = shadeSphere(id, p, n, rd, doSh, spec);
      refl = uMat[id].z * (0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0));
    }
    if (b == uBounces) refl = 0.0;
    acc += w * ((1.0 - refl) * local + spec);
    w *= refl;
    if (w < 0.01) break;
    ro = p + n * 2e-3;
    rd = reflect(rd, n);
    if (id == -1) rd.y = abs(rd.y);
  }
  // haze toward the horizon: only the plane fades to paper, spheres stay inked
  float fog = firstId == -1 ? 1.0 - exp(-pow(firstT * uFog, 2.0)) : 0.0;
  fragColor = vec4(clamp(mix(acc, 1.0, fog), 0.0, 1.0), 0.0, 0.0, 1.0);
}`

export const POST_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec3 uPaper, uInk, uSpot;
uniform float uCell, uAngInk, uAngSpot, uGrain, uVig, uSeed;
uniform vec2 uMisInk, uMisSpot;
out vec4 fragColor;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float tone(vec2 px) { return texture(uScene, px / uRes).r; }

// Euclidean dot: round dots -> checkerboard at 50% -> inverted dots.
float screen(vec2 px, float ang, float cov) {
  vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * px / uCell;
  float th = 0.5 - 0.25 * (cos(TAU * q.x) + cos(TAU * q.y));
  float d = cov * 1.04 - 0.02 - th;
  float w = max(fwidth(d) * 0.7, 1e-3);
  // solids stay solid and bare paper stays bare (AA must not open holes at the extremes)
  return clamp(smoothstep(-w, w, d), smoothstep(0.88, 0.98, cov), smoothstep(0.02, 0.12, cov));
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float g = uGrain;
  float covK = clamp(1.0 - 2.0 * tone(px + uMisInk), 0.0, 1.0);
  float covS = clamp(2.0 - 2.0 * tone(px + uMisSpot), 0.0, 1.0);
  // dead zones keep flat fields solid (8-bit tone + grain must not leak stray dots)
  covK = clamp((covK - 0.10) / 0.80, 0.0, 1.0);
  covS = clamp((covS - 0.06) / 0.84, 0.0, 1.0);
  // grain only roughens the screened mid-tones
  covK = clamp(covK + (hash(px + uSeed * 17.13) - 0.5) * g * 0.8 * covK * (1.0 - covK), 0.0, 1.0);
  covS = clamp(covS + (hash(px * 1.37 + uSeed * 9.71 + 3.1) - 0.5) * g * 0.8 * covS * (1.0 - covS), 0.0, 1.0);
  float dk = screen(px, uAngInk, covK);
  float ds = screen(px, uAngSpot, covS);
  // uneven drum: ink density mottles slightly, per plate
  float mottleS = 1.0 - g * 0.16 * vnoise(px * 0.06 + uSeed * 1.7);
  float mottleK = 1.0 - g * 0.04 * vnoise(px * 0.05 - uSeed * 2.3 + 11.0);
  vec3 paper = uPaper * (1.0 - g * 0.05 * vnoise(px * 0.012 + 5.0));   // static fibre
  vec3 col = paper;
  col *= mix(vec3(1.0), uSpot / max(uPaper, vec3(1e-3)), ds * mottleS);
  col *= mix(vec3(1.0), uInk / max(uPaper, vec3(1e-3)), dk * mottleK);
  col *= 1.0 - g * 0.12 * hash(px * 0.71 + uSeed * 3.7);                  // grain
  vec2 v = px / uRes - 0.5; v.x *= uRes.x / uRes.y;
  col *= 1.0 - uVig * smoothstep(0.35, 1.1, length(v));
  fragColor = vec4(col, 1.0);
}`

export const MAX_SPHERES = 160
