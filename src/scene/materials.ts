import * as THREE from 'three/webgpu';
import { float, fract, glslFn, mix, smoothstep, uniform, uv, vec3, wgslFn, time } from 'three/tsl';

/**
 * Solar-cell surface written directly in WGSL (WebGPU backend) with a GLSL twin for the WebGL2 fallback.
 * Draws 6 × 10 cells with gaps + busbars and a shimmer whose strength follows live PV output.
 */
export const WGSL_SOLAR_CELL = /* wgsl */ `
fn solarCell(uv: vec2<f32>, power: f32, t: f32) -> vec3<f32> {
  let g = vec2<f32>(uv.x * 6.0, uv.y * 10.0);
  let f = fract(g);
  let inCell = step(0.035, f.x) * step(f.x, 0.965) * step(0.025, f.y) * step(f.y, 0.975);
  let bus = step(0.31, f.x) * step(f.x, 0.325) + step(0.675, f.x) * step(f.x, 0.69);
  let cellBase = vec3<f32>(0.035, 0.06, 0.15) + vec3<f32>(0.01, 0.015, 0.03) * sin(g.x * 1.7 + g.y * 2.3);
  var c = mix(vec3<f32>(0.82, 0.84, 0.88), cellBase, inCell);
  c = mix(c, vec3<f32>(0.6, 0.62, 0.66), bus * inCell);
  let wave = 0.5 + 0.5 * sin((uv.x * 0.6 + uv.y) * 14.0 - t * 2.2);
  c = c + vec3<f32>(0.05, 0.13, 0.32) * power * wave * inCell;
  return c;
}
`;

const GLSL_SOLAR_CELL = /* glsl */ `
vec3 solarCell( vec2 uv, float power, float t ) {
  vec2 g = vec2( uv.x * 6.0, uv.y * 10.0 );
  vec2 f = fract( g );
  float inCell = step( 0.035, f.x ) * step( f.x, 0.965 ) * step( 0.025, f.y ) * step( f.y, 0.975 );
  float bus = step( 0.31, f.x ) * step( f.x, 0.325 ) + step( 0.675, f.x ) * step( f.x, 0.69 );
  vec3 cellBase = vec3( 0.035, 0.06, 0.15 ) + vec3( 0.01, 0.015, 0.03 ) * sin( g.x * 1.7 + g.y * 2.3 );
  vec3 c = mix( vec3( 0.82, 0.84, 0.88 ), cellBase, inCell );
  c = mix( c, vec3( 0.6, 0.62, 0.66 ), bus * inCell );
  float wave = 0.5 + 0.5 * sin( ( uv.x * 0.6 + uv.y ) * 14.0 - t * 2.2 );
  c = c + vec3( 0.05, 0.13, 0.32 ) * power * wave * inCell;
  return c;
}
`;

export const panelPower = uniform(0);

export function createPanelMaterial(isWebGPU: boolean): THREE.MeshStandardNodeMaterial {
  const fn = isWebGPU ? wgslFn(WGSL_SOLAR_CELL) : glslFn(GLSL_SOLAR_CELL);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.22, metalness: 0.35 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cell = (fn as any)({ uv: uv(), power: panelPower, t: time });
  m.colorNode = cell;
  m.emissiveNode = cell.mul(panelPower.mul(0.18));
  return m;
}

/** Animated energy-flow tube: stripes travel along the tube (uv.x) by an offset advanced each frame. */
export interface FlowMaterial {
  material: THREE.MeshBasicNodeMaterial;
  offset: { value: number };
  strength: { value: number };
  tint: { value: THREE.Color };
}

export function createFlowMaterial(hex: number, repeats = 10): FlowMaterial {
  const offset = uniform(0);
  const strength = uniform(0);
  const tint = uniform(new THREE.Color(hex));
  const stripe = smoothstep(float(0.45), float(0.85), fract(uv().x.mul(repeats).sub(offset)));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true });
  m.colorNode = mix(vec3(0.25, 0.27, 0.3), tint.mul(float(0.55).add(stripe.mul(1.1))), strength.clamp(0.08, 1));
  m.opacityNode = float(0.55).add(strength.clamp(0, 1).mul(0.45));
  return { material: m, offset, strength, tint };
}
