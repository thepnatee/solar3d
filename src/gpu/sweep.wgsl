// Size × daytime-use sweep: one invocation = one (dayFraction, kWp) scenario.
// Runs the same hourly matching + 3-block tiered bill (Ft + service + VAT) as src/engine/sweep.ts,
// 12 months × 24 hours each, and writes [annualGrossSaving, annualPV, annualSelfUse].

struct Params {
  nSizes: u32,
  nDays: u32,
  _pad0: u32,
  _pad1: u32,
  monthlyKwh: f32,
  block1End: f32,
  block2End: f32,
  rate1: f32,
  rate2: f32,
  rate3: f32,
  ft: f32,
  service: f32,
  vat: f32,
  _pad2: f32,
  _pad3: f32,
  _pad4: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> loadFrac: array<f32>;      // [nDays * 24]
@group(0) @binding(2) var<storage, read> pvPerKwp: array<f32>;      // [12 * 24]
@group(0) @binding(3) var<storage, read> monthLoad: array<f32>;     // [12]
@group(0) @binding(4) var<storage, read> sizes: array<f32>;         // [nSizes]
@group(0) @binding(5) var<storage, read_write> result: array<f32>;  // [nDays * nSizes * 3]

fn energyCharge(kwh: f32) -> f32 {
  let u = max(kwh, 0.0);
  return min(u, P.block1End) * P.rate1
       + max(0.0, min(u, P.block2End) - P.block1End) * P.rate2
       + max(0.0, u - P.block2End) * P.rate3;
}

fn bill(kwh: f32) -> f32 {
  let u = max(kwh, 0.0);
  return (energyCharge(u) + P.ft * u + P.service) * (1.0 + P.vat);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cell = gid.x;
  let total = P.nSizes * P.nDays;
  if (cell >= total) { return; }
  let d = cell / P.nSizes;
  let s = cell % P.nSizes;
  let kwp = sizes[s];

  var gross = 0.0;
  var pv = 0.0;
  var selfUse = 0.0;
  for (var m = 0u; m < 12u; m++) {
    let mLoad = P.monthlyKwh * monthLoad[m];
    var mSelf = 0.0;
    for (var h = 0u; h < 24u; h++) {
      let l = mLoad * loadFrac[d * 24u + h];
      let p = pvPerKwp[m * 24u + h] * kwp;
      mSelf += min(l, p);
      pv += p;
    }
    selfUse += mSelf;
    gross += max(0.0, bill(mLoad) - bill(max(0.0, mLoad - mSelf)));
  }
  result[cell * 3u + 0u] = gross;
  result[cell * 3u + 1u] = pv;
  result[cell * 3u + 2u] = selfUse;
}
