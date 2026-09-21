# 故事线：每日 AI 简报

这一页用一个完整场景把概念逐个带出来。目标：每天 9 点把三个平台的动态
聚合成一份简报，过程可恢复，崩溃了不重复发消息。

完整代码在 `demo/guide.mjs` 里能跑。这里一段一段讲。

## 第 1 步：先把它写成普通代码

不引入任何新概念，先写一个普通 async 函数：

```ts
async function dailyBriefing() {
    const rss = await fetchRss("https://example.com/feed.xml");
    const posts = await fetchPosts("https://api.example.com/posts");
    const digest = summarize([rss, posts]);
    await sendMessage(digest);
    return digest;
}
```

问题出在 `sendMessage` 之后。假如进程在发送前一刻崩溃，重跑一次会再发
一遍消息。`fetchRss` 和 `fetchPosts` 也一样，每次重跑都会重新请求。

## 第 2 步：把副作用换成 Activity

把每个有副作用的调用换成 `workflow.callAction`：

```ts
const definition = {
    key: "daily-briefing",
    manifestHash: "sha256:daily-briefing-v1",
    run: async (workflow) => {
        const rss = await workflow.callAction(
            "source.rss@1",
            { url: "https://example.com/feed.xml" },
        );
        const posts = await workflow.callAction(
            "source.posts@1",
            { url: "https://api.example.com/posts" },
        );
        const digest = await workflow.callAction(
            "summarize@1",
            { items: [rss, posts] },
        );
        await workflow.callAction(
            "notify.send@1",
            { message: digest },
        );
        return digest;
    },
};
```

每个 `callAction` 就是一次 [Activity](/concepts/activity)。引擎会给每次
调用记一条账：路径、序号、类型、参数指纹，还有返回值。

现在崩溃恢复的行为变了。重跑时引擎翻账本：`source.rss@1` 已经做过，直接
把上次的返回值给脚本；`notify.send@1` 也做过，不会重发。只有账上没有的
步骤才会真的执行。这就是[重放](/concepts/replay)。

## 第 3 步：参数变了会怎样

假设第二次跑的时候，RSS 地址改成了新域名。`source.rss@1` 的参数指纹变了，
引擎认为这是新的一次调用，会真的去抓新地址。后面的步骤全部重跑，包括
`notify.send@1`。这符合直觉：输入变了，结果可能变。

如果只想更新前两步、不重新发消息，可以在中间插入一个 checkpoint：

```ts
await workflow.checkpoint({ stage: "fetched" });
```

checkpoint 把进度存进账本。宿主可以拿它做恢复点，比如“内容已抓取，尚未
发送”的状态。细节见[journal 与 fingerprint](/concepts/journal)。

## 第 4 步：三个平台并行抓

三个来源串行抓太慢，用 `workflow.map` 并行：

```ts
const sources = [
    { key: "rss", url: "https://example.com/feed.xml" },
    { key: "posts", url: "https://api.example.com/posts" },
    { key: "events", url: "https://api.example.com/events" },
];

const results = await workflow.map(
    sources,
    (source) => workflow.callAction("source.fetch@1", source),
    { concurrency: 3 },
);
```

map 会给每个分支一条独立路径，比如 `root/1:0`、`root/1:1`。路径稳定，
重放时每个分支各自对账，谁没做完就补谁。并发上限由 `concurrency` 控制。
细节见[map/all 并发](/features/concurrency)。

## 第 5 步：有的源会迟到

某个平台的接口慢，或者要等人工确认，workflow 可以挂起：

```ts
const approval = await workflow.waitForSignal("briefing-approved");
```

挂起时 run 的状态是 `waiting`，账本已落盘，进程可以退出。宿主在条件满足
后从另一个 Runner 投递 signal，run 接着跑：

```ts
await anotherRunner.signal(runId, "briefing-approved", { ok: true });
```

类似的等待还有定时器 `workflow.sleep` 和子任务
`workflow.startChildWorkflow`。细节见[等待与恢复](/features/waits)。

## 第 6 步：摘要太大怎么办

`summarize` 的输出可能很大。引擎的账本只存引用，不存大正文。超过内联
上限的值会交给 ValueStore 保存，账本里放一个内容寻址的引用。重放时按
引用取回。细节见[ValueStore 大值](/features/values)。

## 第 7 步：改主意了

运行到一半想停，调用 `runner.cancel`：

```ts
await runner.cancel(runId);
```

取消后 Activity 的迟到返回值不会写进账本，run 进入 `cancelled` 终态。
细节见[取消](/features/cancel)。

## 第 8 步：账本存在哪

上面的例子全程用内存实现，进程退出账本就没了。真实产品需要把账本存在
数据库里，这就轮到 [Backend](/concepts/backend) 和
[Port 与宿主](/concepts/ports)。引擎只定义接口，存储和 Worker 由宿主实现。

## 第 9 步：看它长什么样

同一个 workflow 有六种观察方式，从运行前的骨架到运行后的精确执行图。
细节见[可视化](/features/visualization)。

## 小结

这一路出现的概念：Activity、journal、fingerprint、checkpoint、map、signal、
ValueStore、cancel、Backend。它们都服务于同一件事：让普通代码变得可恢复。
下一步按顺序读[概念](/concepts/activity)，每个概念单独一页，拆开讲。
