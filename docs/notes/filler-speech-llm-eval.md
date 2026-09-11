# 垫话 LLM 生成评测

车载语音助手的垫话（filler speech）功能新增了可选的 LLM 实时生成候选（`FillerSpeechHook.enable_llm_provider`），与预置文案池并行竞速。以下记录评测脚本的设计思路和一轮实测结果。

## 评测目标

- 候选文本是否满足长度上限、是否包含工具名称或技术词汇
- 端到端延迟分布，核对是否落在 `llm.max_wait_ms` 预算内
- 复用生产代码路径（`ModelRegistry` → `OpenAIModel` → LLM Proxy），不用独立脚本模拟调用

## 测试集设计

覆盖 5 个工具域（导航、天气、音乐、电话、设备控制）共 10 组 `tool_name`/`query` 组合，每组可配置重复请求次数，用于观察延迟分布；并发参数可调，同一测试集可复用为压测输入。脚本位置：`app/scripts/eval_filler_speech_llm.py`。

用例用 `FillerEvalCase` 声明，字段为 `domain`、`tool_name`、`query`：

```python
EVAL_CASES: tuple[FillerEvalCase, ...] = (
    FillerEvalCase("navigation", "navigation_poi_search", "帮我导航去最近的星巴克"),
    FillerEvalCase("weather", "weather_forecast", "明天上海会下雨吗"),
    FillerEvalCase("music", "control_media_playback", "播放周杰伦的歌"),
    FillerEvalCase("phone", "make_phone_call", "打电话给张伟"),
    FillerEvalCase("device_control", "window_switch", "把车窗打开一点"),
    # 共 10 组，覆盖 5 个工具域
)
```

单次请求通过共享的 `asyncio.Semaphore` 控制并发，直接调用生产用的 `LlmFillerSpeechProvider.generate`（内部走 `ModelRegistry.get_model` → `OpenAIModel`），不另写请求客户端：

```python
async def _run_one(provider, config, case, attempt, max_text_chars, semaphore):
    started = time.monotonic()
    text, error = None, None
    try:
        async with semaphore:
            text = await provider.generate(
                config=config,
                tool_name=case.tool_name,
                query=case.query,
                request_id=f"filler-eval-{case.domain}-{attempt}",
                max_text_chars=max_text_chars,
            )
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    latency_ms = (time.monotonic() - started) * 1000
    return FillerEvalResult(case, attempt, latency_ms, text, error, max_text_chars)
```

单条结果的通过判定封装在 `FillerEvalResult.passed`：非空、不超字符上限、不包含 `tool_name` 子串三者同时满足才算通过：

```python
@property
def passed(self) -> bool:
    if self.error is not None or self.text is None:
        return False
    stripped = self.text.strip()
    if not stripped:
        return False
    if len(stripped) > self.max_text_chars:
        return False
    return self.case.tool_name not in stripped
```

汇总时按 `latency_ms` 排序取 p50、p95，并统计超出 `max_wait_ms` 预算的请求数：

```python
latencies = sorted(result.latency_ms for result in results)
p50 = latencies[len(latencies) // 2]
p95 = latencies[int(len(latencies) * 0.95)]
over_budget = sum(1 for r in results if r.latency_ms > max_wait_ms)
```

CLI 参数：`--model`、`--prompt`、`--max-text-chars`、`--max-completion-tokens`、`--max-wait-ms`、`--repeat`、`--concurrency`。质量评测取默认 `--concurrency 1`；压测提高 `--concurrency`，用例集合与判定逻辑保持不变。运行示例：

```bash
# 质量/延迟评测（10 组用例各跑 3 次，顺序执行）
uv run python -m scripts.eval_filler_speech_llm --model Qwen/Qwen3-4B-Instruct-2507 --repeat 3

# 压测（10 组用例各跑 5 次，10 并发，共 50 次请求）
uv run python -m scripts.eval_filler_speech_llm --repeat 5 --concurrency 10
```

模型访问方式二选一：`.env` 中配置 `MODEL_NAME` / `OPENAI_BASE_URL` / `OPENAI_API_KEY`，或在 Apollo 的 `models` 列表中注册目标模型。离线单测（不发真实请求）位于 `app/tests/scripts/test_eval_filler_speech_llm.py`，覆盖用例集完整性、CLI 默认值、`passed` 判定的边界条件。

## 一轮实测结果（`Qwen/Qwen3-4B-Instruct-2507`，test 网关）

顺序执行 20 次请求：通过率 17/20，延迟 p50 152 毫秒，p95 1092 毫秒（单次连接建立导致），超过 350 毫秒预算的请求 1 次。失败原因：候选文本超过字符上限 2 次，候选文本包含工具名英文片段 1 次。

并发 10、共 50 次请求：通过率 34/50，延迟 p50 656 毫秒，p95 1059 毫秒，超过预算的请求 43/50。失败类型包含 HTTP 400 与读超时。同等并发度重复执行时失败次数不稳定，原因未查明。

## 与生产设计的关系

`FillerSpeechHook` 的候选选择逻辑在 LLM 请求失败、超时或校验不通过时退回预置候选，因此评测中出现的网关异常不影响线上垫话可用性，只影响 LLM 候选的命中率。

## 模型是否需要额外训练

现有失败案例均为字符数超限或提示词约束不足导致的工具名片段泄露，均可通过提示词调整解决，未观察到需要额外训练的证据。

## 后续方向：引入自动化提示词调优闭环

参考 `autoresearch_prompt` 的框架结构，可将本评测脚本接入类似的迭代闭环：

- 单 subagent 循环：改动 prompt → 跑评测脚本 → 记录通过率与延迟分位数 → 达标保留 / 退步回滚 → 下一轮
- 常驻 review 步骤检查是否引入超字数、工具名泄露等回归
- 逐轮结果写入 TSV，供后续轮次读取历史趋势并定位问题提示词片段

该框架目前用于 system prompt 和工具描述的调优，垫话 prompt 调优可复用同一套评测记分和回滚机制。
