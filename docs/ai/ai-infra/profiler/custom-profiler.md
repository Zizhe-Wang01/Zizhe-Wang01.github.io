# 自定义 Profiler：把底层事件还原成请求体验

系统工具认识线程、算子和 kernel，却不天然理解 vLLM 的业务阶段。自定义 profiler 的价值，是用 NVTX、日志、时间戳和指标为底层 trace 补充请求语义。

## 为什么需要业务语义

底层 profiler 通常不知道：

- 当前执行的是 `prefill` 还是 `decode`；
- 请求何时进入调度队列；
- 一轮调度选择了哪些 sequence；
- batch 中实际包含多少 token；
- KV Cache 分配、换入或换出花了多久；
- 哪个 kernel 属于哪一个用户请求。

没有这些信息，即使看到 GPU 中出现 20 ms 空洞，也很难判断它影响了哪个请求，以及用户最终感知到的是 TTFT 还是 TPOT。

## 建议记录的请求生命周期

```text
request arrival
→ scheduler waiting
→ prefill start / end
→ first token
→ decode iteration
→ request finished
```

在每个关键阶段记录统一时间戳，并携带 request ID、模型、输入/输出 token 数、batch token 数和并行配置，才能把不同来源的数据可靠关联起来。

## 三种常见实现方式

### 指标与结构化日志

适合长期在线观察。重点包括：

- 请求排队时间；
- TTFT（Time to First Token）；
- TPOT（Time per Output Token）；
- 端到端延迟与吞吐；
- 每轮 scheduled token 数；
- KV Cache 使用率；
- preemption 或 swap 次数。

日志字段应保持结构化，避免后续只能通过文本正则拼接请求生命周期。

### NVTX 标记

NVTX range 可以直接出现在 Nsight Systems 时间线中，适合标记 `scheduler`、`prefill`、`decode` 等阶段。

```python
import torch

torch.cuda.nvtx.range_push("prefill")
try:
    run_prefill()
finally:
    torch.cuda.nvtx.range_pop()
```

标记不宜细到每个极短函数，否则埋点本身会产生噪声。优先标记能够改变排查结论的阶段边界。

### 定向时间戳

适合验证一个明确假设，例如调度等待是否造成 TTFT 升高。时间戳应使用一致的时钟源，并区分同步和异步操作；仅在异步 CUDA 调用前后读取 CPU 时间，通常不能代表 GPU 实际执行耗时。

## 从现象到工具

| 用户现象 | 先看什么 | 下一步 |
| --- | --- | --- |
| TTFT 高 | 排队时间与 prefill 时间 | 用 `nsys` 判断 CPU、GPU 或通信瓶颈 |
| TPOT 波动 | decode 迭代、batch 组成 | 对齐 GPU 空洞和调度事件 |
| 吞吐不高但 GPU 不满 | scheduled token、队列与 KV Cache | 检查调度、同步和内存拷贝 |
| 个别请求排队很久 | request ID 生命周期 | 检查优先级、抢占与长短请求干扰 |
| 多卡扩展效果差 | 通信阶段与 batch 规模 | 定位 collective，再检查链路和 kernel |

## 设计埋点时的原则

1. **先定义问题，再增加字段。** 每个指标都应能支持一个具体判断。
2. **贯通 request ID。** 指标、日志与 trace 必须能关联同一请求。
3. **区分排队与执行。** 否则 TTFT 升高时无法判断 GPU 是否真的变慢。
4. **控制采样率。** 高频 decode 埋点可能影响延迟，也会造成巨量数据。
5. **保留输入上下文。** batch、token 数和并行配置不同，性能不可直接比较。

自定义 profiler 通常不是其他工具的替代品，而是它们之间的“地图图例”：先用请求语义确定异常区间，再进入 [Nsight Systems](nsys.md)、[PyTorch Profiler](torch-profiler.md) 或 [Nsight Compute](ncu.md) 分析底层原因。

[返回四种 Profiler 总览](../profiler.md)
