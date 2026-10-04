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
#ifdef WALLS
attribute vec4 aWall; // x: metres along the wall, y: height above its base, z: wall height, w: facade style (-1 = plain)
varying vec4 vWall;
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
  #ifdef WALLS
    vWall = aWall;
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
#ifdef WALLS
varying vec4 vWall;
#endif

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float band(float a, float b, float v) { return step(a, v) * step(v, b); }

void main() {
  vec3 n = normalize(vN);
  vec3 c = vC * uTint;
  float dist = length(vW - cameraPosition);

  #ifdef WALLS
  if (vWall.w > -0.5) {
    // London facades, drawn procedurally from the wall's own coordinates.
    float u = vWall.x;
    float y = vWall.y;
    float top = vWall.z;
    float st = vWall.w;
    float id = floor(top * 4.0 + 0.5); // constant per building, safe to hash
    float fade = 1.0 - smoothstep(170.0, 420.0, dist);
    vec3 wall = c;
    vec3 glass = vec3(0.3, 0.38, 0.5);
    vec3 trim = vec3(0.97, 0.95, 0.9);
    float cw = 3.2; float ch = 3.3; float g0 = 3.6; // bay width, storey height, ground-floor height
    vec4 wr = vec4(0.3, 0.7, 0.2, 0.78);             // window rect inside a bay
    float framed = 1.0;
    if (st > 3.5) { cw = 2.2; ch = 3.5; g0 = 0.0; wr = vec4(0.06, 0.94, 0.1, 0.9); framed = 0.0; glass = mix(vec3(0.34, 0.5, 0.62), vec3(0.72, 0.86, 0.92), clamp(y / max(top, 1.0), 0.0, 1.0)); }
    else if (st > 2.5) { cw = 4.4; ch = 3.8; g0 = 4.2; wr = vec4(0.18, 0.82, 0.22, 0.74); trim = wall * 0.72; }
    else if (st > 1.5) { cw = 3.9; ch = 4.1; g0 = 4.6; wr = vec4(0.3, 0.7, 0.16, 0.72); trim = wall * 1.06; }
    float house = floor(u / (cw * 2.0));
    if (st < 1.5) wall *= 0.93 + 0.14 * hash(vec2(house, id)); // every house its own brick
    vec3 col = wall;
    float fu = fract(u / cw);
    if (y > g0) {
      float fy = fract((y - g0) / ch);
      float open = band(wr.x, wr.y, fu) * band(wr.z, wr.w, fy) * step(y, top - 1.0);
      float frame = band(wr.x - 0.06, wr.y + 0.06, fu) * band(wr.z - 0.05, wr.w + 0.05, fy) * step(y, top - 1.0);
      col = mix(col, trim, frame * framed);
      float lit = step(0.93, hash(vec2(floor(u / cw), floor((y - g0) / ch)) + id));
      col = mix(col, mix(glass, vec3(0.98, 0.86, 0.62), lit * 0.55), open);
      // sash bar
      if (framed > 0.5) col = mix(col, trim, open * band(0.47, 0.53, (fy - wr.z) / (wr.w - wr.z)) * step(st, 2.5));
      // cornice
      col = mix(col, trim, band(top - 0.55, top, y) * step(st, 3.5));
      if (st > 3.5) col = mix(col, vec3(0.86, 0.9, 0.92), band(0.0, 0.07, fract((y - g0) / ch)) * 0.8);
    } else if (st < 0.5) {
      // terrace ground floor: one front door per house, a window beside it
      float hu = fract(u / (cw * 2.0));
      float door = band(0.14, 0.32, hu) * band(0.0, 2.5, y);
      vec3 doorCol = mix(vec3(0.12, 0.13, 0.16), mix(vec3(0.62, 0.16, 0.14), vec3(0.14, 0.3, 0.42), hash(vec2(house, 3.0))), step(0.45, hash(vec2(house, 7.0))));
      col = mix(col, trim, band(0.11, 0.35, hu) * band(0.0, 3.0, y));
      col = mix(col, doorCol, door);
      col = mix(col, trim, band(0.56, 0.9, hu) * band(0.8, 2.9, y));
      col = mix(col, glass, band(0.6, 0.86, hu) * band(1.0, 2.7, y));
    } else if (st < 1.5) {
      // shopfronts: a coloured fascia over plate glass
      float shop = floor(u / (cw * 2.0));
      vec3 fascia = 0.35 + 0.5 * vec3(hash(vec2(shop, 1.0)), hash(vec2(shop, 2.0)), hash(vec2(shop, 3.0)));
      float hu = fract(u / (cw * 2.0));
      col = mix(col, fascia * 0.8, band(2.9, 3.6, y));
      col = mix(col, glass * 1.25, band(0.06, 0.94, hu) * band(0.5, 2.8, y));
      col = mix(col, trim, band(0.47, 0.53, hu) * band(0.5, 2.8, y));
    } else if (st < 2.5) {
      // rusticated stone base with tall arched openings
      col = wall * 0.9;
      col = mix(col, wall * 0.78, band(0.0, 0.08, fract(y / 1.15)));
      col = mix(col, glass, band(0.32, 0.68, fu) * band(0.6, 3.7, y));
    } else {
      // warehouse loading bays
      col = wall * 0.92;
      col = mix(col, vec3(0.22, 0.24, 0.27), band(0.2, 0.8, fu) * band(0.0, 3.3, y) * step(0.5, hash(vec2(floor(u / cw), id))));
      col = mix(col, glass, band(0.24, 0.76, fu) * band(1.2, 3.2, y) * step(hash(vec2(floor(u / cw), id)), 0.5));
    }
    // far away, settle to the average so facades do not shimmer
    c = mix(mix(wall, glass, st > 3.5 ? 0.75 : 0.16), col, fade);
  }
  #endif

  #ifdef GROUND
    c *= 0.965 + 0.07 * hash(floor(vW.xz / 9.0));
  #endif

  // Cel bands: lit / half / shade
  float d = dot(n, uLight);
  float lightBand = d > 0.42 ? 1.0 : (d > -0.12 ? 0.5 : 0.0);
  vec3 shade = mix(vec3(0.66, 0.63, 0.76), vec3(1.0, 0.95, 0.86), lightBand);
  c *= shade;
  // soft sky bounce on upward faces
  c += vec3(0.03, 0.04, 0.06) * max(n.y, 0.0);

  float f = smoothstep(uFogNear, uFogFar, dist) * 0.9;
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;

export interface ToonOpts {
  vertexColors?: boolean;
  /** procedural London facades (needs the aWall attribute) */
  walls?: boolean;
  ground?: boolean;
  /** draw on top of coplanar ground: larger = nearer */
  layer?: number;
  tint?: number;
  side?: THREE.Side;
}

export function toonMaterial(o: ToonOpts = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.walls) defines.WALLS = '';
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
    polygonOffset: !!o.layer,
    polygonOffsetFactor: -(o.layer ?? 0),
    polygonOffsetUnits: -(o.layer ?? 0) * 2,
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
