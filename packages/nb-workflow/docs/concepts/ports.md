# Port 与宿主

Port 是引擎向宿主借能力的接口。宿主是使用本包的产品，比如 Cosmos。

## 分工

引擎负责：

- Activity 身份、journal、重放
- map 分支、等待、取消
- 受控时钟和随机数

宿主负责：

- 账本存哪里（Backend）
- 外部副作用怎么执行（ActivityExecutor）
- 大值存哪里（ValueStore）
- 信号、定时器、子任务的实现（SignalStore 等）

## 主要 Port

```text
WorkflowBackend    账本读写，带版本号
ActivityExecutor   执行外部 action 和 query
DefinitionRegistry 按 key/version/manifest 找到 workflow 定义
ValueStore         大值内容寻址存储
EventSink          幂等事件发布
SignalStore        信号发布与消费
TimerStore         定时器等待
ChildWorkflowStore 子任务绑定与终态
Clock              时钟（测试可注入假时钟）
IdGenerator        唯一 ID
RandomSource       随机数
```

每个 Port 都是接口。引擎不实现它们，只定义合同。

## 一个例子

workflow 里写 `workflow.sleep(5000)`，引擎不自己睡，它调用 `TimerStore`。
宿主可以用 setTimeout 实现，也可以接真实调度器。重放时引擎问 TimerStore
"这个定时器到点没有"，答案由宿主持有，所以跨进程也能恢复。

## 为什么这么设计

引擎和宿主分开，各自可以独立演进。引擎不需要知道数据库长什么样，宿主
不需要复制重放逻辑。Cosmos 接本包时，写一个 Prisma Backend 和几个
Adapter 就行，引擎代码一行不改。

## 相关

- [Backend](/concepts/backend)
- [能力协商](/concepts/capability)
