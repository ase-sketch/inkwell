# 快速上手

这一页讲最小可跑的流程。读完你能写出第一个 workflow，并看到它跑起来。

## 装包

```bash
npm install @notnotype/nb-workflow
```

## 写第一个 workflow

workflow 就是一个 async 函数。函数里通过 `workflow` 对象调用外部能力，
不要直接碰文件、数据库或者网络。这样引擎才能记账和重放。

```ts
import {
    MemoryActivityExecutor,
    WorkflowRunner,
} from "@notnotype/nb-workflow";

const activities = new MemoryActivityExecutor();
activities.registerAction(
    "math.double@1",
    ({ value }: { value: number }) => ({ value: value * 2 }),
);

const definition = {
    key: "my-first-workflow",
    manifestHash: "sha256:my-first-workflow-v1",
    run: async (workflow) => {
        const result = await workflow.callAction(
            "math.double@1",
            { value: 21 },
        );
        return result;
    },
};

const runner = new WorkflowRunner({}, {}, { activities });
const view = await runner.start(definition, null);

console.log(view.status);  // completed
console.log(view.result);  // { value: 42 }
```

`runner.start` 返回一个 `RunView`。里面除了结果，还有这次运行的完整流水账
（`view.journal`），后面讲重放时会用到。

## 跑起来看效果

仓库里有教学演示，覆盖十一个特性，每个特性都有实际输出：

```bash
bun run demo:guide
```

## 下一步

跟着[故事线](/guide/story)写一个真实场景，概念会在例子里逐个出现。
