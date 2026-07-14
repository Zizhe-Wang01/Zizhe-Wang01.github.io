# UE Socket

## Socket、IP 与端口

Socket 是通信端点。IP 用于找到主机，端口用于找到主机上的具体服务。

```text
127.0.0.1:8060
```

其中：

- `127.0.0.1` 是本机回环地址；
- `8060` 是端口号。

## 需要继续整理的问题

- `NAME_Stream` 为什么表示流式 Socket
- TCP 连接建立以后为什么不能随意更换目标地址
- `ISocketSubsystem` 的职责
