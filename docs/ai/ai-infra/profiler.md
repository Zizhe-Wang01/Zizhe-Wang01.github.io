# Profiler

给 vLLM 做性能分析时，不同工具观察的是不同层级，不能互相替代。一个更有效的思路是：**先定位问题属于哪一层，再逐步放大细节。**

<div class="grid cards" markdown>

-   :material-chart-timeline-variant: **[Nsight Systems（nsys）](profiler/nsys.md)**

    ---

    从系统时间线观察 CPU、GPU、CUDA Runtime、线程与通信，适合寻找 GPU 空洞和调度阻塞。

    **适合：全局定位 · 第一步排查**

    [进入文章 →](profiler/nsys.md)

-   :material-fire: **[PyTorch Profiler](profiler/torch-profiler.md)**

    ---

    从框架与算子层分析耗时、调用次数及 CPU/CUDA 对应关系，适合定位高开销算子。

    **适合：算子归因 · PyTorch 代码分析**

    [进入文章 →](profiler/torch-profiler.md)

-   :material-chip: **[Nsight Compute（ncu）](profiler/ncu.md)**

    ---

    深入单个 CUDA kernel，分析 SM、Tensor Core、显存带宽、occupancy 和 cache 等硬件指标。

    **适合：Kernel 深挖 · 最后一步优化**

    [进入文章 →](profiler/ncu.md)

-   :material-map-marker-path: **[自定义 Profiler](profiler/custom-profiler.md)**

    ---

    用 NVTX、日志和指标补齐请求语义，观察排队、prefill、decode、TTFT、TPOT 与 KV Cache。

    **适合：请求级诊断 · 业务指标关联**

    [进入文章 →](profiler/custom-profiler.md)

</div>

## 一张表快速选择

| 方法 | 观察层级 | 最适合回答的问题 | 使用时机 |
| --- | --- | --- | --- |
| `nsys` | 系统时间线 | GPU 为什么空闲？CPU 是否及时提交任务？ | 全局定位时 |
| `torch.profiler` | 框架 / 算子 | 哪个 PyTorch 算子最耗时？ | 已锁定到模型计算阶段时 |
| `ncu` | CUDA kernel | kernel 为什么没有吃满硬件？ | 已找到可疑 kernel 后 |
| 自定义 profiler | 请求 / 业务语义 | TTFT、TPOT 或排队时间为什么异常？ | 建立现象与底层 trace 的联系时 |

## 推荐排查顺序

```text
自定义埋点 / 指标：确认用户感知到的慢发生在哪个阶段
        ↓
nsys：查看系统时间线，判断是 CPU、GPU、通信还是内存拷贝
        ↓
torch.profiler：定位阶段内最耗时的 PyTorch 算子
        ↓
ncu：只对少量可疑 CUDA kernel 做硬件级分析
```

例如，发现 vLLM 的首 token 延迟很高：

1. 先用请求级指标确认时间主要花在排队、prefill 还是网络；
2. 用 `nsys` 看这段时间 GPU 是否空闲、CPU 是否阻塞；
3. 用 `torch.profiler` 找出 prefill 中最耗时的算子；
4. 最后对异常的 attention 或 GEMM kernel 使用 `ncu`。

!!! tip "不要一开始就收集所有细节"
    profiler 越深入，采集开销和数据量通常越大。先缩小问题范围，再提高分析精度，往往比一次抓取所有信息更快。
