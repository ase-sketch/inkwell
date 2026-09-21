# journal 与 fingerprint

journal 是 workflow 的流水账。fingerprint 是账目里的参数摘要。

## journal 里有什么

每次 Activity 执行成功，账本多一条记录：

```ts
{
    key: "root#0",
    path: "root",
    seq: 0,
    kind: "action",
    fingerprint: "sha256:1f2e...",
    result: { kind: "inline", value: { ok: true } },
}
```

`key` 是 `path#seq` 的简写。`fingerprint` 是参数规范化后的 SHA-256。
`result` 是小值内联，大值只放引用。

## fingerprint 解决什么

重放时引擎遇到同一条路径同一个序号，要判断"这次调用和上次是不是同一
件事"。判断依据就是参数指纹。

```ts
await workflow.callAction("source.fetch@1", { url: "a.com" });
// 指纹 = sha256(参数)
```

下次重跑参数还是 `{ url: "a.com" }`，指纹相同，直接读旧结果。参数变成
`{ url: "b.com" }`，指纹不同，引擎认为这是新调用，重跑这条路径及之后
的所有步骤。

## 后缀失效

参数变化只影响这条路径上序号之后的记录，前面做过的保留。

```text
root#0  source.fetch@1（参数没变，保留）
root#1  source.fetch@1（参数变了，从这里作废）
root#2  summarize@1（重跑）
```

## 大值不进账本

账本只存 JSON 能内联的小值。超过内联上限的输出交给
[ValueStore](/features/values)，账本里放一个内容寻址引用。这样账本不会
被大正文撑大，重放时按引用取回。

## checkpoint 是什么

checkpoint 是 Activity 的一种，把进度值写进账本：

```ts
await workflow.checkpoint({ stage: "fetched" });
```

重放时 checkpoint 与其它 Activity 一样按账本恢复。宿主可以用它判断"跑
到哪一步了"。多个并发分支各写各的 checkpoint，最终投影按路径和序号
确定，不依赖完成先后。

## 相关

- [Activity](/concepts/activity)
- [重放与恢复](/concepts/replay)
