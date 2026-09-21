# map/all 并发

用 `workflow.map` 或 `workflow.all` 并发执行多条分支。

```ts
const results = await workflow.map(
    [1, 2, 3, 4, 5, 6],
    (item) => workflow.callAction("work.do@1", { item }),
    { concurrency: 2 },
);
```

## 分支路径

每条分支有独立路径：`root/1:0`、`root/1:1`。路径里的序号来自 map 调用
点的位置，索引来自数组下标。分支路径稳定，和完成先后无关。

重放时每条分支各自对账。某个分支的参数变了，只重跑那一条分支。

## 并发上限

`concurrency` 控制同时执行的分支数。不传时用 Runner 的默认值，最大值
由 `maxConcurrency` 限制，超出的请求直接拒绝。

```ts
const runner = new WorkflowRunner({}, {}, {
    defaultConcurrency: 4,
    maxConcurrency: 16,
});
```

## 失败怎么选

多条分支同时失败时，按输入下标最小的那条报错，不依赖完成先后。这样
重放的行为可预测。

## all 和 map 的区别

`all` 接收 thunk 数组，适合手动控制每条分支。`map` 接收数组和函数，
适合按数据展开。两者共享同样的分支身份规则。

## 相关

- [概念：Activity](/concepts/activity)
- [故事线第 4 步](/guide/story)
