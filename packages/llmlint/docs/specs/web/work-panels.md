# 工作面板规格

> 状态：Accepted（2026-08-16，第二轮前端旅程）。  
> 范围：`inspect-edit` 阶段右侧的总览、规则命中和 Agent 三个首轮面板。  
> 非范围：正文组件、盲评分表、历史 revision 面板和跨版本比较。

## 1. 共用合同

三个首轮面板是同一工作区的查询视图，不拥有业务事实：

- 所有 revision 相关数据显式携带 `revisionId`。
- 第一轮当前 revision 恒为唯一 head。
- 组件只接收 query model，只发出语义命令。
- 面板不得直接调用正文组件、兄弟面板、Prisma DTO 或 `$fetch`。
- 缺失、运行中、失败、不适用和数值 0 是不同状态。
- 切换面板不启动检测、不创建 revision、不改变草稿。
- 面板选择同步到 URL，可刷新恢复。
- `blind-review` 阶段不挂载工作面板；评分抽屉不属于 WorkPanel。

```ts
type InitialWorkPanelId = "overview" | "issues" | "agent";

type PanelProps<T> = {
    model: T;
    busyCommands: string[];
};

type PanelEvent = {
    command: WorkspaceCommand;
};
```

长期保留 `revisions` panel id，但历史旅程 spec Accepted 前不渲染该 tab，也不实现临时列表。

## 2. 总览面板 `overview`

### 2.1 用户问题

> 当前 revision 的机器风险多高，检测完整了吗，最值得先看什么？

### 2.2 信息顺序

1. **风险摘要**：版本化 AI 风险参考分和方向说明。
2. **检测覆盖**：规则、每个外部 detector、LLM review 各自状态。
3. **原始指标**：规则命中、docScore、每个 detector 的 P(AI)、LLM 风险分。
4. **优先事项**：高风险规则、不可自动处理项、无法定位的动态命中。
5. **人类反馈**：当前 revision 的盲评或 skip；有候选版时显示 canonical D5。

### 2.3 分数合同

总览不能把文章质量压成一个分数。允许显示：

- `aiRiskScore`：AI 风险参考分，范围和方向固定，携带 `algorithmVersion`。
- 原始通道分数：规则风险、外部 P(AI)、LLM 风险。
- `coverage`：各通道成功、运行中、失败或不可用状态。

```ts
type RiskSummary = {
    aiRiskScore: number | null;
    direction: "higher-is-riskier";
    algorithmVersion: string;
    coverage: {
        rules: ChannelStatus;
        detectors: Array<{identity: DetectorIdentityDto; status: ChannelStatus}>;
        llmReview: ChannelStatus;
    };
    caveat: "risk-not-quality";
};
```

规则命中密度、外部 detector 概率和 LLM 判断可以形成版本化风险摘要，但不能与 `wantReadOn` 合成。人类“想继续读”属于独立 judgment 轴。

### 2.4 多 detector

- 总览列出全部 detector/run，不截取数组第一项。
- 每项显示完整 DetectorIdentity、状态、docPAi 和 heatmap 是否可用。
- 用户选择某项后发送 `select-heatmap`，正文表面只绘制该 run。
- 没有用户选择时可以使用服务器声明的 primary detector；数组顺序没有产品语义。
- identity 不同的结果不混算、不叠成同一热力图、不画同一趋势。
- D5 卡明确标出 primary；其他 detector 只作独立诊断。

### 2.5 行为

- 点击规则通道或关键命中，切换到 Rules 面板并聚焦稳定 `hitId`。
- 点击 detector，选择对应 heatmap。
- 点击失败状态，按 capability 发出 retry command。
- `blind-review` 不构造 Overview model；隐藏机器数据由服务器 DTO 保证。

## 3. 规则命中面板 `issues`

### 3.1 用户问题

> 哪些规则命中了哪里，证据是什么，我应该先处理哪些？

```ts
type RuleSuggestionView = {
    suggestionId: string;
    replacement: string;
};

type RuleHitView = {
    hitId: string;
    revisionId: string;
    ruleId: string;
    ruleTitle: string;
    source: "static" | "dynamic";
    detector: "regex" | "handler" | "density" | "semantic" | "llm";
    severity: string;
    verdict: "strong" | "weak" | "noise" | "anti" | "unmeasured";
    fixability: "auto" | "candidate" | "manual";
    span: {start: number; end: number} | null;
    quote: string;
    explanation: string;
    engineIdentity: EngineIdentityDto;
    suggestion: RuleSuggestionView | null;
    status: "active" | "stale" | "resolved";
};
```

`source` 描述本次命中来自确定性扫描或 LLM；`verdict` 描述规则在 evals 中的判别证据。二者不能混用。

功能：

- 按严重级别、规则、namespace、source、verdict 和 fixability 过滤。
- 支持按规则分组或按正文位置排序。
- 点击命中时，正文表面聚焦同一 `hitId`。
- 无 span 的动态命中显示 quote 和“无法可靠定位”，不伪造位置。
- 查看 immutable revision 时只提供定位、解释、评价和“开始修改”。
- 打开 DraftSession 且待确认队列为空时，可以通过 `apply-static-suggestions` 应用单项或本组建议。命令只提交稳定 suggestion id 和 expected generation；服务器原子验证整组，任一项 stale 时整组不写入。
- 查看 draft 时，本地预览命中标记为 `draft-preview`；它没有 server suggestion id，不能应用或与落库 MachineScan 混为同一列表。
- 用户隐藏规则属于个人显示或扫描偏好，不修改历史 MachineScan 或 evals verdict。

## 4. Agent 面板 `agent`

### 4.1 用户问题

> Agent 现在基于哪一版或哪份草稿工作，它看过什么、建议改什么，我是否接受？

```ts
type AgentInvocationContext = {
    invocationId: string;
    sessionId: string;
    revisionId: string;
    draft: null | {
        draftSessionId: string;
        generation: number;
        bodyFingerprint: Fingerprint;
    };
    intent: "analyze" | "optimize" | "rewrite-selection" | "question";
    selection: {target: DocumentSurfaceTarget; start: number; end: number; quote: string} | null;
};
```

每次 invocation 冻结 revision、可选 DraftSession authoritative generation/body fingerprint 和选区。只有草稿待确认队列为空时才能发起可产出 proposal 的 invocation。切换 panel、overlay 或 heatmap 不改变在途 invocation 归属。面板顶部显示本次调用的版本和草稿身份；当前草稿已变化时，proposal 标记 stale，只能重新调用，不能静默套到新正文。

Agent 可以通过 server tool adapter：

- 读取指定已揭示 revision 或绑定 DraftSession 的正文。
- 查看该 revision 的规则命中、detector 和 LLM review。
- 对 DraftSession 提交 edit proposal。
- 运行 `lint_check`，并在允许时运行机械 `lint_fix`。
- 解释规则和给出修改建议。

Agent 不可以：

- 修改已提交 Revision。
- 把自己的分数写成人类 judgment。
- 在 blind-review 读取机器数据或运行修改命令。
- 在 invocation 未绑定时猜当前版本或草稿。
- 绕过 DraftSession 直接创建 Revision。

### 4.2 对话与 proposal

- snapshot 是 durable 真相；SSE 只负责增量 transport。
- text、thinking、tool、approval、error 和 terminal 是不同事件类型。
- tool call 显示目标 revision、DraftSession 和结果摘要。
- edit proposal 进入正文表面的 draft change 审阅，不自动接受。
- 接受 proposal 只修改 DraftSession；保存后才创建 Revision。
- retry 创建新 invocation；abort 只作用目标 invocation。
- 连接中断保留 timeline；cursor 无法补齐时重新取 snapshot。

## 5. 面板联动

```text
Overview 风险项 ──focus hit────► Rules + DocumentEditorSurface
Overview detector ─select heat──► DocumentEditorSurface
Rules 命中 ───────focus hit────► DocumentEditorSurface
Agent 引用命中 ──focus hit────► Rules + DocumentEditorSurface
正文命中事件 ────focus hit────► Rules
```

所有联动经过 Workspace command bus 和稳定 id。面板不持有正文组件 ref，不通过 DOM 查询驱动其他组件。

窄屏 sheet 关闭只改变 session-local open 状态，不清空选中的 panel id。`close-work-panel-sheet` 必须支持可见关闭按钮和 Escape，模态焦点留在 sheet 内；关闭后焦点回到打开它的控件并恢复正文滚动位置。

## 6. 延后能力

以下能力等待独立历史旅程 spec：

- Revisions 面板。
- 历史 revision 选择。
- parent、rev0 或任意 baseline 比较。
- revision provenance 时间线。
- 正文内联跨版本 diff。

## 7. 验收

1. inspect-edit 首轮只出现 Overview、Rules 和 Agent 三个 tab。
2. 面板切换不改变正文、DraftSession 或后台 operation。
3. 所有命中、指标和 Agent invocation 都能追溯到 revision 或 DraftSession。
4. Overview 不把机器风险描述成文章质量。
5. 多 detector 逐项展示，正文只绘制明确选择的一张热力图。
6. Rules 的 source、verdict 和 fixability 保持独立语义。
7. Agent 在途 invocation 始终显示冻结的版本与草稿身份。
8. 跨面板定位通过稳定 id 和 command bus。
9. 界面没有 Revisions 空 tab 或版本比较占位入口。