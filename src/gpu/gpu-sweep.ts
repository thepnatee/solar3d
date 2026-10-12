import { hourlyLoadFractions, sweepCPU, type SweepInput, type SweepOutput } from '../engine';
import shaderCode from './sweep.wgsl?raw';

let devicePromise: Promise<GPUDevice | null> | null = null;
let pipeline: GPUComputePipeline | null = null;

/** Reuse the 3D renderer's GPUDevice so the page holds a single WebGPU device. */
export function useSharedDevice(device: GPUDevice): void {
  devicePromise = Promise.resolve(device);
  pipeline = null;
}

function getDevice(): Promise<GPUDevice | null> {
  if (!devicePromise) {
    devicePromise = (async () => {
      try {
        if (!('gpu' in navigator) || !navigator.gpu) return null;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return null;
        const device = await adapter.requestDevice();
        device.lost.then(() => {
          devicePromise = null;
          pipeline = null;
        });
        return device;
      } catch {
        return null;
      }
    })();
  }
  return devicePromise;
}

function storage(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({ size: Math.max(16, data.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
  return buf;
}

/** Runs the size sweep as a WGSL compute shader; falls back to the CPU reference when WebGPU is unavailable. */
export async function sweep(input: SweepInput): Promise<SweepOutput> {
  const blocks = input.tariff.blocks;
  const device = blocks.length === 3 ? await getDevice() : null;
  if (!device) return sweepCPU(input);

  try {
    const t0 = performance.now();
    pipeline ??= device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: shaderCode }), entryPoint: 'main' },
    });
    const nSizes = input.sizes.length;
    const nDays = input.dayFractions.length;
    const cells = nSizes * nDays;

    const params = new ArrayBuffer(64);
    const u32 = new Uint32Array(params);
    const f32 = new Float32Array(params);
    u32[0] = nSizes;
    u32[1] = nDays;
    const t = input.tariff;
    f32.set([input.monthlyKwh, blocks[0]!.upTo!, blocks[1]!.upTo!, blocks[0]!.rate, blocks[1]!.rate, blocks[2]!.rate, t.ftBahtPerKwh, t.serviceFee, t.vatRate], 4);
    const paramBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(paramBuf, 0, params);

    const loadFrac = new Float32Array(input.dayFractions.flatMap((df) => hourlyLoadFractions(input.loadWeights, df)));
    const pv = new Float32Array(input.pvPerKwp.flat());
    const buffers = [
      paramBuf,
      storage(device, loadFrac),
      storage(device, pv),
      storage(device, new Float32Array(input.monthlyLoadFactors)),
      storage(device, new Float32Array(input.sizes)),
    ];
    const outSize = cells * 3 * 4;
    const out = device.createBuffer({ size: outSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size: outSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [...buffers, out].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(cells / 64));
    pass.end();
    enc.copyBufferToBuffer(out, 0, read, 0, outSize);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const res = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    [...buffers, out, read].forEach((b) => b.destroy());

    const grossSaving = new Float64Array(cells);
    const pvKwh = new Float64Array(cells);
    const selfUseKwh = new Float64Array(cells);
    for (let i = 0; i < cells; i++) {
      grossSaving[i] = res[i * 3]!;
      pvKwh[i] = res[i * 3 + 1]!;
      selfUseKwh[i] = res[i * 3 + 2]!;
    }
    return { sizes: input.sizes, dayFractions: input.dayFractions, grossSaving, pvKwh, selfUseKwh, backend: 'webgpu-wgsl', ms: performance.now() - t0 };
  } catch (e) {
    console.warn('WebGPU sweep failed, using CPU', e);
    return sweepCPU(input);
  }
}
