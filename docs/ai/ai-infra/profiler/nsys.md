# Nsight Systems：先看整个系统哪里在等

`nsys` 是 NVIDIA Nsight Systems 的命令行工具。它把 CPU 线程、CUDA Runtime、GPU kernel、内存拷贝和通信事件放在同一条时间线上，适合用来完成性能分析的第一轮全局定位。

## 它能回答什么

- CPU 是否及时向 GPU 提交任务？
- GPU 中间为什么出现空闲区间？
- 多个 CUDA stream 是否真正并行？
- kernel 之间是否存在异常间隔？
- 是否发生了频繁或意外的内存拷贝？
- Python、调度线程或通信是否跟不上 GPU？

可以把 `nsys` 理解为一张“交通路况图”：它不负责解释每一台发动机的内部状态，但能快速指出拥堵发生在哪里。

## 在 vLLM 中重点看什么

### GPU 空洞

先找 GPU 时间线中的大块空白，再向上对齐 CPU 和 CUDA Runtime：

- CPU 同期繁忙，可能是调度或 Python 开销；
- CPU 同期等待，可能是锁、同步或 I/O；
- 通信事件很长，可能是张量并行或跨卡链路问题；
- 拷贝事件密集，可能存在 Host/Device 数据搬运。

### Prefill 与 Decode 的形态

prefill 通常包含规模较大的计算；decode 则由大量较短的迭代组成。观察两者是否互相阻塞，以及 decode 迭代之间是否存在稳定空洞，可以帮助判断 continuous batching 和调度是否有效。

### CUDA Graph

开启 CUDA Graph 后，CPU 侧通常会出现 graph replay，GPU 侧仍能看到实际执行的 kernel。此时系统时间线比只看框架算子更容易判断 replay 之间为什么出现间隔。

## 基本采集方式

```bash
nsys profile \
  --trace=cuda,nvtx,osrt \
  --output=vllm-profile \
  <启动或压测命令>
```

采集后使用 Nsight Systems 图形界面打开生成的报告。正式分析前，建议先缩短请求数量和采集时间，避免 trace 过大。

!!! note "命令参数需要按场景调整"
    vLLM 的启动方式、容器权限、CUDA 版本和多进程模式都会影响采集命令。先确认最小案例可以生成报告，再逐步恢复真实负载。

## 推荐分析步骤

1. 在请求指标中选出一个有代表性的慢请求；
2. 用 NVTX 或时间戳在 trace 中定位对应区间；
3. 查看 GPU 是否持续忙碌；
4. 若 GPU 有空洞，向上追踪 CPU、Runtime、通信和拷贝；
5. 若 GPU 一直繁忙，再转向 [PyTorch Profiler](torch-profiler.md) 定位高开销算子；
6. 若已锁定某个 kernel，再使用 [Nsight Compute](ncu.md) 深挖。

## 常见误区

- **只看 GPU 利用率均值。** 均值会掩盖短周期空洞，应结合时间线观察。
- **一次采集完整线上流量。** 报告会非常大，也更难把事件关联到具体请求。
- **看到长 kernel 就直接判定异常。** kernel 耗时还要结合输入规模、调用频率和整体占比判断。
- **没有业务标记。** 缺少请求 ID、prefill/decode 等语义时，底层事件很难对应到用户感知。

[返回四种 Profiler 总览](../profiler.md)
