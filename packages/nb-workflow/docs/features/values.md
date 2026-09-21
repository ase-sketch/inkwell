# ValueStore 大值

Activity 的返回值超过内联上限时，不进 journal，改为内容寻址存储。

## 内联与引用

journal 里只放两种值：

```ts
type WorkflowValue =
    | { kind: "inline"; value: JsonValue }
    | { kind: "ref"; ref: ValueRef };
```

小值内联在账本里。大值写入 ValueStore，账本里放引用：

```ts
{
    kind: "ref",
    ref: {
        key: "values/ab12...",
        hash: "sha256:ab12...",
        byteSize: 251,
        mediaType: "application/json",
    },
}
```

## 上限怎么配

```ts
const runner = new WorkflowRunner({}, {}, {
    values: new MemoryValueStore(),
    inlineValueLimitBytes: 64 * 1024,
});
```

超过上限且没配 ValueStore，run 会明确失败，不会把无界 payload 塞进账本。

## 完整性校验

ValueStore 按内容寻址：同样的内容得到同样的引用。读取时校验 hash、
大小和媒体类型，对不上就抛完整性错误。

## 应用范围

Run 输入、Activity 输出、checkpoint、最终结果，四类值共用同一套内联/
引用规则。

## 相关

- [概念：journal](/concepts/journal)
