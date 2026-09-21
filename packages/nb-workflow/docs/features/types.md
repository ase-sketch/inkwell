# 类型与校验

Activity 的输入和输出可以显式声明类型，编译期检查，不需要类型断言。

## 双泛型

```ts
activities.registerAction<{ value: number }, { value: number }>(
    "math.double@1",
    ({ value }) => ({ value: value * 2 }),
);

const result = await workflow.callAction<
    { value: number },
    { value: number }
>("math.double@1", { value: 21 });
```

注册时第一个泛型是输入，第二个是输出。调用时第一个泛型是输出，第二个
是输入。写错字段会在编译期报错。

## 运行时 schema

类型只在编译期生效。运行时的输入来自外部，可能不符合声明。注册时可以
挂一个输入 schema，执行前解析：

```ts
import { z } from "zod";

const doubleInput = z.object({ value: z.number() });

activities.registerAction(
    "math.double@1",
    ({ value }) => ({ value: value * 2 }),
    { input: doubleInput },
);
```

schema 只需要 `parse(input)` 一个方法，zod、TypeBox 或者手写校验器都能
用。非法输入在 Activity 边界被拒绝，不进入执行。

## 引擎自己的校验

不管有没有 schema，Activity 输入都会经过 JSON 校验：拒绝 undefined、
NaN、循环引用、稀疏数组、超深对象、非数据属性。指纹只基于规范化 JSON，
类型安全和可重放性由这两层共同保证。

## 相关

- [概念：Activity](/concepts/activity)
