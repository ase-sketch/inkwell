# nb-workflow

一个会记账的脚本式 Workflow 引擎。

你写一个普通 async 函数当作工作流。引擎在旁边记流水账：每一步调用了谁、
传了什么参数、返回了什么。进程崩了，引擎按账本重放，已经做完的步骤直接
读答案，不会重复执行。

```ts
import {
    MemoryActivityExecutor,
    WorkflowRunner,
} from "@notnotype/nb-workflow";

const activities = new MemoryActivityExecutor();
activities.registerAction("math.double@1", ({ value }: { value: number }) => ({
    value: value * 2,
}));

const runner = new WorkflowRunner({}, {}, { activities });
const view = await runner.start({
    key: "hello",
    manifestHash: "sha256:hello-v1",
    run: async (workflow) => {
        const result = await workflow.callAction(
            "math.double@1",
            { value: 21 },
        );
        return result;
    },
}, null);

console.log(view.result); // { value: 42 }
```

## 从这里开始

想先看效果，跑教学演示，十一个特性逐个有输出：

```bash
bun run demo:guide
```

想跟着一个真实场景从头写，读[故事线：每日 AI 简报](/guide/story)。

想按顺序理解每个概念，从 [Activity](/concepts/activity) 开始。
