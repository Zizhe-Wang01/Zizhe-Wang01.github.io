# UE 线程

## 为什么子线程不能随便操作 UObject

许多 UE 对象和系统默认由游戏线程管理。即使某个 C++ 函数本身能够在线程中运行，也不代表其中访问的 UObject、World 或 UI 状态是线程安全的。

## 需要继续整理的问题

- `FRunnable` 和 `FRunnableThread` 的分工
- 线程退出和对象销毁顺序
- `FCriticalSection` 与 `FScopeLock`
- 如何把结果安全地送回游戏线程
