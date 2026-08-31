/**
 * PGRBGpuEngine - WebGPU 显存并行算路引擎 (WGSL Compute Shader)
 * 将全路网拓扑上传至 GPU 显存 (StorageBuffer)，利用 GPU 数千核心并行执行松弛迭代算路
 */

export class PGRBGpuEngine {
    constructor() {
        this.adapter = null;
        this.device = null;
        this.pipeline = null;
        this.bindGroup = null;

        this.nodeCount = 0;
        this.edgeCount = 0;
        this.isReady = false;

        // GPU 显存 Buffer 句柄
        this.nodeOffsetsBuffer = null;
        this.edgesBuffer = null;
        this.distancesBuffer = null;
        this.prevNodesBuffer = null;
        this.updatedBuffer = null;
        this.readbackBuffer = null;
    }

    /**
     * 检测并初始化 WebGPU 环境
     */
    async init() {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            console.warn('[WebGPU] 浏览器不支持 WebGPU API，将自动降级使用 CPU 引擎');
            return false;
        }

        try {
            this.adapter = await navigator.gpu.requestAdapter();
            if (!this.adapter) {
                console.warn('[WebGPU] 未查找到可用的 WebGPU 显卡适配器');
                return false;
            }

            this.device = await this.adapter.requestDevice();

            // 编译 WGSL Compute Shader (GPU 图松弛迭代计算着色器)
            const shaderModule = this.device.createShaderModule({
                label: 'PGRB_BellmanFord_Shader',
                code: `
                    @group(0) @binding(0) var<storage, read> nodeOffsets : array<u32>;
                    @group(0) @binding(1) var<storage, read> edges : array<vec4<f32>>; // [target, cost, revCost, coordStart]
                    @group(0) @binding(2) var<storage, read_write> distances : array<atomic<u32>>;
                    @group(0) @binding(3) var<storage, read_write> prevNodes : array<atomic<i32>>;
                    @group(0) @binding(4) var<storage, read_write> updated : atomic<u32>;

                    @compute @workgroup_size(256)
                    fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
                        let u = gid.x;
                        if (u >= arrayLength(&nodeOffsets) - 1u) { return; }

                        let dist_u_bits = atomicLoad(&distances[u]);
                        let dist_u = bitcast<f32>(dist_u_bits);

                        // 如果起点不可达 (1e9 填充值)，跳过
                        if (dist_u >= 1e8f) { return; }

                        let start = nodeOffsets[u];
                        let end   = nodeOffsets[u + 1u];

                        for (var i = start; i < end; i = i + 1u) {
                            let e = edges[i];
                            let cost = e.y;

                            if (cost >= 0.0f) {
                                let v = u32(e.x);
                                let new_dist = dist_u + cost;
                                let new_bits = bitcast<u32>(new_dist);

                                let old_bits = atomicMin(&distances[v], new_bits);
                                if (new_bits < old_bits) {
                                    atomicStore(&prevNodes[v], i32(u));
                                    atomicStore(&updated, 1u);
                                }
                            }

                            let revCost = e.z;
                            if (revCost >= 0.0f) {
                                let v = u32(e.x);
                                let new_dist = dist_u + revCost;
                                let new_bits = bitcast<u32>(new_dist);

                                let old_bits = atomicMin(&distances[v], new_bits);
                                if (new_bits < old_bits) {
                                    atomicStore(&prevNodes[v], i32(u));
                                    atomicStore(&updated, 1u);
                                }
                            }
                        }
                    }
                `
            });

            this.pipeline = this.device.createComputePipeline({
                label: 'PGRB_Compute_Pipeline',
                layout: 'auto',
                compute: {
                    module: shaderModule,
                    entryPoint: 'main'
                }
            });

            console.log(`[WebGPU] ⚡ 显卡硬件加速引擎初始化完成: ${this.adapter.info ? this.adapter.info.description : 'WebGPU Device'}`);
            return true;
        } catch (e) {
            console.warn('[WebGPU] 初始化 GPU 引擎发生异常:', e);
            return false;
        }
    }

    isSupported() {
        return this.device !== null && this.isReady;
    }

    /**
     * 将 PGRB 图拓扑上传至 GPU StorageBuffers 显存
     */
    async uploadGraph(pgrbRouter) {
        if (!this.device || !pgrbRouter || !pgrbRouter.isLoaded) return false;

        this.nodeCount = pgrbRouter.nodeCount;
        this.edgeCount = pgrbRouter.edgeCount;

        // 1. 上传 NodeOffsets [N + 1]
        const nodeOffsetsData = pgrbRouter._nodeOffsets;
        this.nodeOffsetsBuffer = this.device.createBuffer({
            label: 'GPU_NodeOffsets',
            size: nodeOffsetsData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(
            this.nodeOffsetsBuffer,
            0,
            nodeOffsetsData.buffer,
            nodeOffsetsData.byteOffset,
            nodeOffsetsData.byteLength
        );

        // 2. 打包并上传 Edges [M * 4 * 4B] -> vec4<f32>(target, cost, reverseCost, coordStart)
        const edgesData = new Float32Array(this.edgeCount * 4);
        for (let i = 0; i < this.edgeCount; i++) {
            edgesData[i * 4 + 0] = pgrbRouter._edgesTarget[i];
            edgesData[i * 4 + 1] = pgrbRouter._edgesCost[i];
            edgesData[i * 4 + 2] = pgrbRouter._edgesReverseCost[i];
            edgesData[i * 4 + 3] = pgrbRouter._edgesCoordStart[i];
        }

        this.edgesBuffer = this.device.createBuffer({
            label: 'GPU_Edges',
            size: edgesData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.edgesBuffer, 0, edgesData);

        // 3. 创建可写 Distances Buffer [N * 4B]
        this.distancesBuffer = this.device.createBuffer({
            label: 'GPU_Distances',
            size: this.nodeCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        // 4. 创建可写 PrevNodes Buffer [N * 4B]
        this.prevNodesBuffer = this.device.createBuffer({
            label: 'GPU_PrevNodes',
            size: this.nodeCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        // 5. 创建更新收敛标志 Updated Buffer [4B]
        this.updatedBuffer = this.device.createBuffer({
            label: 'GPU_Updated_Flag',
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        // 6. 创建读回 Staging Buffer (用于从 GPU 显存复制回 CPU 内存)
        const readbackSize = this.nodeCount * 4 * 2 + 4; // distances + prevNodes + updated
        this.readbackBuffer = this.device.createBuffer({
            label: 'GPU_Readback_Staging',
            size: readbackSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });

        // 绑定 BindGroup
        this.bindGroup = this.device.createBindGroup({
            label: 'PGRB_BindGroup',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.nodeOffsetsBuffer } },
                { binding: 1, resource: { buffer: this.edgesBuffer } },
                { binding: 2, resource: { buffer: this.distancesBuffer } },
                { binding: 3, resource: { buffer: this.prevNodesBuffer } },
                { binding: 4, resource: { buffer: this.updatedBuffer } }
            ]
        });

        this.isReady = true;
        console.log(`[WebGPU] 🚀 已将全路网图结构上传至 GPU 显存 (节点: ${this.nodeCount}, 边: ${this.edgeCount})`);
        return true;
    }

    /**
     * 使用 GPU 显存执行全节点并行路径规划
     */
    async computeShortestPath(startIdx, endIdx) {
        if (!this.isSupported() || startIdx < 0 || endIdx < 0) {
            return null;
        }

        const initDist = new Uint32Array(this.nodeCount);
        const floatView = new Float32Array(initDist.buffer);
        floatView.fill(1e9);
        floatView[startIdx] = 0.0;

        const initPrev = new Int32Array(this.nodeCount).fill(-1);

        this.device.queue.writeBuffer(this.distancesBuffer, 0, initDist);
        this.device.queue.writeBuffer(this.prevNodesBuffer, 0, initPrev);

        let converged = false;
        let iteration = 0;
        const maxIterations = 500;
        const workgroupCount = Math.ceil(this.nodeCount / 256);

        const zeroFlag = new Uint32Array([0]);

        while (!converged && iteration < maxIterations) {
            this.device.queue.writeBuffer(this.updatedBuffer, 0, zeroFlag);

            const commandEncoder = this.device.createCommandEncoder();
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroup);
            pass.dispatchWorkgroups(workgroupCount);
            pass.end();

            commandEncoder.copyBufferToBuffer(this.updatedBuffer, 0, this.readbackBuffer, 0, 4);
            this.device.queue.submit([commandEncoder.finish()]);

            await this.readbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
            const updatedVal = new Uint32Array(this.readbackBuffer.getMappedRange(0, 4))[0];
            this.readbackBuffer.unmap();

            if (updatedVal === 0) {
                converged = true;
            }
            iteration++;
        }

        const distBytes = this.nodeCount * 4;
        const prevBytes = this.nodeCount * 4;

        const readEncoder = this.device.createCommandEncoder();
        readEncoder.copyBufferToBuffer(this.distancesBuffer, 0, this.readbackBuffer, 0, distBytes);
        readEncoder.copyBufferToBuffer(this.prevNodesBuffer, 0, this.readbackBuffer, distBytes, prevBytes);
        this.device.queue.submit([readEncoder.finish()]);

        await this.readbackBuffer.mapAsync(GPUMapMode.READ, 0, distBytes + prevBytes);
        const mappedBuf = this.readbackBuffer.getMappedRange(0, distBytes + prevBytes);
        const gpuDistances = new Float32Array(mappedBuf.slice(0, distBytes));
        const gpuPrevNodes = new Int32Array(mappedBuf.slice(distBytes, distBytes + prevBytes));
        this.readbackBuffer.unmap();

        const totalDist = gpuDistances[endIdx];
        if (totalDist >= 1e8) {
            return { path: [], distance: 0 };
        }

        const path = [];
        for (let curr = endIdx; curr !== -1; curr = gpuPrevNodes[curr]) {
            path.push(curr);
        }
        path.reverse();

        console.log(`[WebGPU] GPU 松弛求解完成: 迭代 ${iteration} 次, 路径长: ${path.length} 节点`);
        return { path, distance: totalDist };
    }
}

if (typeof window !== 'undefined') {
    window.PGRBGpuEngine = PGRBGpuEngine;
}

export default PGRBGpuEngine;
