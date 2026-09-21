# Activity

Activity 是 workflow 里一次有副作用的调用。副作用指会改变外部世界的操作：
请求接口、写数据库、发消息、调模型。

## 问题

普通代码里，`fetch` 调用失败了重跑就是再请求一次。请求成功但进程在
写结果前崩溃，重跑会重复请求。引擎无法区分"这个请求做没做过"。

Activity 把一次调用变成账本上的一条记录。重跑时先查账，做过就直接读
上次的结果，不做第二次。

## 在代码里是什么

```ts
const result = await workflow.callAction(
    "source.fetch@1",
    { url: "https://example.com/feed.xml" },
);
```

`callAction` 做四件事：

1. 给这次调用算一个身份。身份由路径、序号、类型和参数指纹组成。
2. 查账本。身份相同且参数没变，直接返回上次的结果，不执行。
3. 身份对不上（参数变了），把这条路径后面的旧账作废，重新执行。
4. 执行完把结果写进账本。

## 身份是什么

每次 Activity 有四个字段：

```text
path        root 或 root/1:0（map 分支）
seq         路径内的序号，0 开始
kind        action、query、signal、timer、checkpoint 等
fingerprint 参数的 SHA-256
```

四个字段都一样，就是同一次调用。参数指纹变了，就是新调用。

## 类比

Activity 像快递面单。面单上有发件人、收件人、包裹内容摘要。同一张面单
不会重复发货。内容摘要变了，才是一张新面单。

## 和 query 的区别

`workflow.query` 和 `callAction` 行为一样，语义上区分读写。query 表示只读
查询，callAction 表示会改外部状态。引擎对两者一视同仁，都记账。

## 相关

- [journal 与 fingerprint](/concepts/journal)
- [重放与恢复](/concepts/replay)
