# Agentic RL 01: Policy Gradient Loss

## 问题背景

这里记录 Agentic RL 中 policy gradient loss 的基本形式，以及它和多轮 agent trajectory 的关系。

## 核心目标

### 优化对象

- 待整理：policy model、rollout policy、reference policy 的关系。

### 奖励信号

- 待整理：trajectory-level reward、step-level reward、token-level log probability 的对应关系。

## Loss 形式

### 基础 Policy Gradient

- 待整理：从 \(\nabla_\theta J(\pi_\theta)\) 到采样估计形式。

### Advantage 加权

- 待整理：为什么需要 advantage，以及 baseline 如何降低方差。

### Token-level 计算

- 待整理：如何把 trajectory reward 分配到 token log probability 上。

## Agentic RL 特殊问题

### 多轮 Credit Assignment

- 待整理：成功或失败通常由多个 turn 共同决定，不能只看最后一个 token。

### Tool Call 与 Action Space

- 待整理：工具选择、参数生成、自然语言推理是否属于同一种 action。

### Off-policy 修正

- 待整理：异步 rollout、旧策略轨迹和 importance ratio 的处理。

## 实现记录

### Rollout 需要保存什么

- prompt / observation
- action tokens
- tool call result
- reward
- old log probability
- policy version

### 训练时需要检查什么

- reward variance
- clip ratio
- KL
- token mask 比例
- 训练端和推理端 log probability 是否一致
