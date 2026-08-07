# Nsight Compute：深入分析单个 CUDA Kernel

`ncu` 是 NVIDIA Nsight Compute 的命令行工具，用于分析单个 CUDA kernel 如何使用 GPU 硬件。只有在前面的分析已经找到少量可疑 kernel 后，才适合进入这一层。

## 它能回答什么

- SM 利用率是否足够高？
- Tensor Core 是否被充分使用？
- kernel 更接近计算瓶颈还是显存带宽瓶颈？
- shared memory 和寄存器使用是否合理？
- warp 是否存在 divergence？
- occupancy 为什么不高？
- L1/L2 cache 命中率如何？
- 访存是否合并，是否存在大量等待 stall？

如果说 `nsys` 在看道路、`torch.profiler` 在识别车型，那么 `ncu` 就是在拆解一台车的发动机。

## 为什么不应一开始就用 ncu

对整个 vLLM 服务直接做全面采集通常会遇到三个问题：

- 指标数量和报告体积很大；
- 重放与采集会显著降低运行速度；
- 大量相似 kernel 会淹没真正值得分析的目标。

更合理的流程是先通过 [Nsight Systems](nsys.md) 找到异常区间，再通过 [PyTorch Profiler](torch-profiler.md) 或 kernel 名称缩小目标。

## 基本采集思路

```bash
ncu \
  --kernel-name <目标 kernel 名称> \
  --launch-skip <跳过的启动次数> \
  --launch-count <采集次数> \
  --set full \
  <目标命令>
```

`--set full` 能提供较完整的指标，但采集成本也更高。实际排查时，可以先使用较轻的指标集合，再对极少数目标做完整采集。

## 阅读报告的思路

### 先判断瓶颈类型

- 计算管线繁忙、Tensor Core 利用充分：更可能受计算吞吐限制；
- DRAM 吞吐接近上限、计算管线空闲：更可能受显存带宽限制；
- 两者都不高：继续查看 latency、依赖、occupancy 和 launch 配置。

### 再看资源与并发

寄存器或 shared memory 使用过多，可能限制每个 SM 上同时驻留的 block 数量。但 occupancy 不是越高越好，它只是解释吞吐不足的一个线索，必须结合实际 stall 和管线利用率判断。

### 最后验证优化

每次只改变一个因素，并同时检查：

1. 单个 kernel 是否变快；
2. kernel 调用次数是否变化；
3. 端到端 TTFT、TPOT 或吞吐是否真的改善。

局部 kernel 加速不一定会转化为服务整体收益。

## 常见误区

- **看到低 occupancy 就强行提高。** 更高 occupancy 可能增加资源竞争，并不保证更快。
- **只优化单次耗时。** 低频 kernel 即使大幅加速，对端到端性能也可能没有影响。
- **比较不同输入规模的报告。** sequence length、batch token 数和数据类型必须保持一致。
- **忽略采集扰动。** ncu 的重放机制会改变执行时间，不应用采集时的端到端延迟评估服务性能。

[返回四种 Profiler 总览](../profiler.md)
