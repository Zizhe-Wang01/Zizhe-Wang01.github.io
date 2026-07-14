# Qt 学习

## 最简单的信号与槽

```cpp
connect(ui->pushButton, &QPushButton::clicked, this, []()
{
    qDebug() << "按钮被点击";
});
```

## 后续整理

- `Q_OBJECT` 的作用
- `.ui` 文件如何生成 C++ 代码
- `delete ui` 为什么需要
- `QWizard` 页面切换
