import * as THREE from 'three';

/**
 * One hand-written cel shader used for the whole world: three stepped light
 * bands, a warm key / cool shadow split, and distance fog that melts into the
 * sky. It is far cheaper than the built-in lit materials (no light loops, no
 * shadows), which is what keeps mid-range phones at frame rate.
 */
export const SUN_DIR = new THREE.Vector3(0.55, 0.66, 0.5).normalize();
export const FOG_COLOR = new THREE.Color(0xf6dcc0);

export const shared = {
  uTime: { value: 0 },
  uLight: { value: SUN_DIR },
  uFog: { value: FOG_COLOR },
  uFogNear: { value: 140 },
  uFogFar: { value: 1250 },
};

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vC;
#ifdef GROUND
attribute float aStreet;
varying float vStreet;
#endif
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    mat3 im = mat3(instanceMatrix);
    // inverse-transpose for non-uniformly scaled instances
    n = im * (n / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vC = vec3(1.0);
  #ifdef USE_COLOR
    vC *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vC *= instanceColor;
  #endif
  #ifdef GROUND
    vStreet = aStreet;
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uTint;
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying vec3 vC;
#ifdef GROUND
varying float vStreet;
#endif

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 n = normalize(vN);
  vec3 c = vC * uTint;
  float dist = length(vW - cameraPosition);

  #ifdef WINDOWS
  if (abs(n.y) < 0.5 && vW.y > 2.2) {
    float u = abs(n.x) > abs(n.z) ? vW.z : vW.x;
    vec2 cell = vec2(u / 3.4, vW.y / 3.6);
    vec2 f = fract(cell);
    float win = step(0.24, f.x) * step(f.x, 0.76) * step(0.28, f.y) * step(f.y, 0.78);
    float lit = step(0.86, hash(floor(cell) + floor(vW.xz * 0.02)));
    vec3 glass = mix(vec3(0.36, 0.45, 0.58), vec3(1.0, 0.86, 0.55), lit);
    float fade = 1.0 - smoothstep(160.0, 420.0, dist);
    c = mix(c, glass, win * 0.62 * fade + 0.1 * (1.0 - fade));
  }
  #endif

  #ifdef GROUND
  {
    vec2 g = abs(mod(vW.xz + 23.0, 46.0) - 23.0);
    float road = max(smoothstep(16.6, 17.2, g.x), smoothstep(16.6, 17.2, g.y)) * vStreet;
    vec3 asphalt = vec3(0.56, 0.53, 0.53);
    c = mix(c, asphalt, road);
    // dashed centre line
    float lx = (1.0 - smoothstep(0.18, 0.3, abs(g.x - 23.0))) * step(0.5, fract(vW.z / 6.0)) * step(g.y, 16.0);
    float lz = (1.0 - smoothstep(0.18, 0.3, abs(g.y - 23.0))) * step(0.5, fract(vW.x / 6.0)) * step(g.x, 16.0);
    float fade = 1.0 - smoothstep(90.0, 220.0, dist);
    c = mix(c, vec3(0.96, 0.92, 0.8), max(lx, lz) * road * fade);
    // painterly blotches
    c *= 0.97 + 0.06 * hash(floor(vW.xz / 7.0));
  }
  #endif

  // Cel bands: lit / half / shade
  float d = dot(n, uLight);
  float band = d > 0.42 ? 1.0 : (d > -0.12 ? 0.5 : 0.0);
  vec3 shade = mix(vec3(0.66, 0.63, 0.76), vec3(1.0, 0.95, 0.86), band);
  c *= shade;
  // soft sky bounce on upward faces
  c += vec3(0.03, 0.04, 0.06) * max(n.y, 0.0);

  float f = smoothstep(uFogNear, uFogFar, dist) * 0.9;
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;

export interface ToonOpts {
  vertexColors?: boolean;
  windows?: boolean;
  ground?: boolean;
  tint?: number;
  side?: THREE.Side;
}

export function toonMaterial(o: ToonOpts = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.windows) defines.WINDOWS = '';
  if (o.ground) defines.GROUND = '';
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      ...shared,
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
    },
    vertexColors: o.vertexColors ?? false,
    side: o.side ?? THREE.FrontSide,
  });
}

export function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: { uLight: shared.uLight },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 0.0);
        gl_Position = projectionMatrix * vec4(p.xyz, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.1, 1.0);
        vec3 horizon = vec3(0.965, 0.863, 0.753);
        vec3 mid = vec3(0.78, 0.87, 0.93);
        vec3 top = vec3(0.42, 0.66, 0.88);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, uLight), 0.0);
        c += vec3(1.0, 0.82, 0.55) * (pow(s, 8.0) * 0.25 + smoothstep(0.9985, 0.9993, s));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function waterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFog;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vW;
      void main() {
        float dist = length(vW - cameraPosition);
        vec2 p = vW.xz;
        float w1 = sin(p.x * 0.21 + uTime * 0.9 + sin(p.y * 0.13 + uTime * 0.4) * 2.2);
        float w2 = sin(p.y * 0.34 - uTime * 0.7 + sin(p.x * 0.17) * 1.7);
        float crest = smoothstep(0.9, 0.97, w1 * 0.6 + w2 * 0.4 + 0.25);
        float fade = 1.0 - smoothstep(120.0, 380.0, dist);
        vec3 deep = vec3(0.33, 0.6, 0.66);
        vec3 lite = vec3(0.5, 0.76, 0.78);
        vec3 c = mix(deep, lite, 0.5 + 0.5 * sin(p.x * 0.05 + p.y * 0.04 + uTime * 0.2));
        c = mix(c, vec3(0.93, 0.97, 0.95), crest * fade * 0.8);
        float f = smoothstep(uFogNear, uFogFar, dist) * 0.9;
        gl_FragColor = vec4(mix(c, uFog, f), 1.0);
      }`,
  });
}
