# C++ 基础

## 声明与定义

声明告诉编译器一个名字和它的类型；定义则真正提供对象或函数的实现。

```cpp
// 声明
int add(int a, int b);

// 定义
int add(int a, int b)
{
    return a + b;
}
```

## 指针与引用

```cpp
int value = 10;

int* pointer = &value;
int& reference = value;
```

- 指针保存地址，可以为空，也可以重新指向其他对象。
- 引用是对象的别名，初始化后不能重新绑定。
