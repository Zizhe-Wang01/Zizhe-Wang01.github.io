# PyTorch Profiler：定位框架与算子开销

`torch.profiler` 位于 Python 代码与 CUDA kernel 之间，能够把 PyTorch 算子、CPU 活动和 CUDA 活动关联起来。它适合回答“模型的哪一部分最耗时”，也是从系统级现象继续下钻的重要一步。

## 它能回答什么

- 哪个 PyTorch 算子占用时间最多？
- 算子被调用了多少次，单次耗时是否稳定？
- 时间主要消耗在 Python、CPU 还是 GPU？
- CPU 算子对应启动了哪些 CUDA kernel？
- `torch.compile` 是否减少了算子数量或形成融合区域？
- `matmul`、attention、`all_reduce`、`copy_` 等操作各占多少比例？

如果把 `nsys` 看作交通路况图，那么 `torch.profiler` 更像是在统计“哪一种车辆造成了拥堵”。

## 最小采集示例

```python
import torch
from torch.profiler import ProfilerActivity, profile, record_function

with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    record_shapes=True,
    profile_memory=True,
    with_stack=True,
) as prof:
    with record_function("model_inference"):
        run_inference()

print(prof.key_averages().table(
    sort_by="self_cuda_time_total",
    row_limit=20,
))
```

真实服务不宜无限制采集。可以使用 schedule 只记录少量稳定迭代，并导出 Chrome trace 或 TensorBoard trace 进行查看。

## 读结果时看哪些列

| 指标 | 含义 | 适合判断 |
| --- | --- | --- |
| CPU total | 算子及其子调用的 CPU 总时间 | 整段调用的 CPU 开销 |
| CPU self | 不包含子调用的 CPU 时间 | 算子自身是否有明显 CPU 开销 |
| CUDA total | 算子关联的 CUDA 总时间 | 哪类算子占用 GPU 最多 |
| CUDA self | 不包含子调用的 CUDA 时间 | 当前算子自身的 GPU 开销 |
| Calls | 调用次数 | 是否存在大量细碎调用 |

总时间高不一定意味着单次执行慢：一个很短的算子如果被调用成千上万次，也可能成为主要开销。因此需要同时查看总耗时、平均耗时和调用次数。

## CUDA Graph 下的限制

在 CUDA Graph 场景中，profiler 可能主要看到 graph replay，而无法像 eager 模式一样完整呈现 graph 内每个框架算子与 kernel 的边界。vLLM 开启 CUDA Graph 后，不应只依赖 `torch.profiler` 得出结论。

可采用以下方式交叉验证：

1. 用 [Nsight Systems](nsys.md) 观察 replay 前后和 GPU 时间线；
2. 在可控环境中暂时关闭 CUDA Graph，比较算子构成；
3. 对确认有问题的 kernel 使用 [Nsight Compute](ncu.md)。

## 常见误区

- **在 warm-up 阶段统计。** 初始化、编译和缓存建立会污染稳态结果。
- **只按总耗时排序。** 还应关注 self time、调用次数和输入 shape。
- **采集窗口过长。** profiler 自身有开销，长时间采集会改变服务行为。
- **把相关性当成根因。** 高耗时算子可能只是输入规模或上游调度问题的结果。

[返回四种 Profiler 总览](../profiler.md)
