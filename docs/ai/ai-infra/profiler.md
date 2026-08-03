# profiler

**给 vLLM 做性能分析时，不同工具观察的是不同层级，不能互相替代。**

总共有从宏观到微观的四层：

### 1. `nsys`：先看整个系统哪里在等

`nsys` 是 **NVIDIA Nsight Systems**，观察 CPU、GPU、CUDA Runtime、线程之间的完整时间线。

它主要回答：

* CPU 是否及时提交 GPU 任务？
* GPU 中间为什么出现空闲？
* CUDA 流之间有没有并行？
* 是否有频繁的内存拷贝？
* kernel 执行之间为什么存在间隔？
* Python/调度线程是不是跟不上 GPU？

适合最先使用，因为它能判断瓶颈大致属于：

```text
CPU 调度问题
    ↓
GPU kernel 问题
    ↓
通信问题
    ↓
内存拷贝问题
```

它更像是看“交通路况”。

---

### 2. `torch.profiler`：看 PyTorch 算子慢在哪里

它观察的是框架和算子层，例如：

* `matmul`
* `attention`
* `softmax`
* `all_reduce`
* `copy_`
* `torch.compile` 生成的计算区域

它主要回答：

* 哪个 PyTorch 箐子耗时最多？
* CPU 算子与 CUDA 算子的对应关系是什么？
* 某个算子被调用了多少次？
* `torch.compile` 是否真的融合了算子？
* 时间是在 Python、CPU 还是 GPU 上消耗的？

它更像是看“哪一种车辆造成了拥堵”。

不过图下面提到一个重要限制：

> 在 CUDA Graph 场景下，`torch.profiler` 可能只能看到一次 graph replay，而看不到 graph 内部每个 kernel 的真实边界。

所以 vLLM 开启 CUDA Graph 后，单独依赖 `torch.profiler` 容易看不完整。

---

### 3. `ncu`：深入分析某一个 CUDA kernel

`ncu` 是 **NVIDIA Nsight Compute**，用于 kernel 级分析。

假设前面已经发现某个 attention kernel 特别慢，才进一步用 `ncu` 看：

* SM 利用率多高？
* Tensor Core 有没有充分利用？
* 是计算瓶颈还是显存带宽瓶颈？
* shared memory 使用了多少？
* 寄存器是否过多？
* warp 是否发生 divergence？
* occupancy 为什么不高？
* L1/L2 cache 命中率如何？

它更像是把某辆车拆开，研究发动机内部为什么效率低。

所以不建议一上来就用 `ncu` 扫整个 vLLM 流程：

* 数据量非常大；
* 运行速度会明显下降；
* 很难找到真正值得分析的 kernel。

---

### 4. 自定义 profiler：看业务语义和请求级问题

前三类工具知道“算子”和“kernel”，但不一定知道 vLLM 的业务阶段。

例如它们不天然理解：

* 这一段是 `prefill` 还是 `decode`；
* 某个请求什么时候进入调度队列；
* 首 token 延迟是多少；
* 请求等待调度花了多久；
* 一轮调度选择了哪些 sequence；
* batch 中有多少 token；
* KV Cache 分配或换入换出花了多久。

所以需要通过 NVTX、日志、时间戳或自定义埋点标记：

```text
request arrival
→ scheduler waiting
→ prefill
→ first token
→ decode iteration
→ request finished
```

它主要回答用户真正感知的问题：

* TTFT 为什么高？
* TPOT 为什么波动？
* 某个请求为什么排队很久？
* GPU 明明没满，吞吐为什么上不去？
* prefill 和 decode 是否互相干扰？

---

## 实际排查顺序

```text
自定义埋点 / 指标
        ↓
nsys 看系统时间线
        ↓
torch.profiler 看算子
        ↓
ncu 深挖特定 kernel
```

例如发现 vLLM 首 token 很慢：

1. 自定义指标确认时间主要花在等待、prefill 还是网络；
2. 用 `nsys` 看等待期间 GPU 是否空闲、CPU 是否阻塞；
3. 用 `torch.profiler` 找出 prefill 中最耗时的算子；
4. 最后对某个异常 attention 或 GEMM kernel 使用 `ncu`。


