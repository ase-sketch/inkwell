# 可视化

同一个 workflow 有六种观察方式。全部是纯数据 API，输出 mermaid 字符串
或结构化数据，不绑定 UI。

## ① 声明骨架（运行前）

`definition.phases` 里声明阶段，`skeletonMermaid` 画成流程图：

```ts
import { skeletonMermaid } from "@notnotype/nb-workflow";

const definition = {
    key: "briefing",
    phases: [
        { key: "fetch", title: "拉取" },
        { key: "digest", title: "汇总" },
    ],
    run: async (workflow) => { /* ... */ },
};

console.log(skeletonMermaid(definition));
```

## ② AST 静态 CFG（运行前）

`extractCfg` 扫描 workflow 函数源码，标出 wf 调用点和控制结构：

```ts
import { extractCfg } from "@notnotype/nb-workflow";

const cfg = extractCfg(definition.run.toString());
console.log(cfg.mermaid);
```

这是静态近似图，允许漏报。`extractCfg` 需要可选的 typescript 依赖，
未安装时调用会得到明确错误。

## ③ journal 精确 trace（运行后）

`traceGraph` 从账本画出真实执行图：

```ts
import { traceGraph } from "@notnotype/nb-workflow";

const trace = traceGraph(view.journal);
console.log(trace.mermaid);
```

同路径按顺序连边，map 分支有派生边和汇合边，ask 节点单独标注。嵌套的
map 也能找到真实父路径。

## ④ 运行时状态图（执行中）

workflow 里增量声明节点和指针：

```ts
workflow.chart.node("analysis", "分析");
workflow.chart.move("root", "analysis", { token: "main" });
```

这些操作通过 `RunEnv.onEvent` 的 chart 事件流式输出。token 表示并发执行
线，多个 token 停在不同节点时，并发在图上可见。

## ⑤ 进度与日志

```ts
workflow.progress({ phase: "digest", done: 1, total: 2 });
workflow.log("开始汇总");
```

进入 `RunView.progress` 和 `RunView.logs`，随 run 一起持久化。

## ⑥ 交互播放器

仓库里 `bun run demo` 生成 `demo/index.html`，把一次 run 的账本重放成
可拖动帧，包含 ask 暂停点和参数变化后的失效重放画面。

## 实际输出

教学演示的第 11 节逐一打印前五种的实际输出：

```bash
bun run demo:guide
```
