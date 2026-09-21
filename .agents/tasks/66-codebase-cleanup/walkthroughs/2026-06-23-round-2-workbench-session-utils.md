# Round 2 - Workbench Session Utils

## 背景

Round 1 确认 `WorldEngineWorkbenchDialog.vue` 是当前最大维护风险，但直接大拆真实 Workbench 容器会和大量未提交改动缠在一起。本轮选择一个低风险切口：把 Dialog 中与 Vue 状态无关的纯数组逻辑下沉到 `world-engine-workbench-real.ts`。

## 深入评估

目标逻辑有两个特点：

- 它们属于真实 Workbench session 编排，但不依赖 DOM、`ref`、`computed` 或 `$fetch`。
- 它们的行为会影响作者操作：
  - 已知 slice time 用于 Composer 避开同 instant。
  - 草稿 slice id 顺序用于 Drafts 摘要和跳转。

因此它们适合成为一个更深的 util Module：调用方只需要传数组，具体排序、去重、过滤空时间的规则集中在一个 Interface 后面。

## 修改内容

新增 util：

- `collectWorldWorkbenchSliceTimes(slices)`
  - 从切片列表抽取非空 time，并 trim。
- `mergeWorldWorkbenchKnownSliceTimes(existingTimes, slices)`
  - 把局部 timeline 或懒加载切片并入已知时间窗口。
  - 新发现的时间排在前面，已有时间保持原顺序。
- `collectWorldWorkbenchDraftSliceIds({metadataDraftSliceIds, valueDraftSliceIds, slices})`
  - 汇总 metadata / value 草稿。
  - 已在当前 timeline 中出现的 slice 按 timeline 顺序排列。
  - 不在当前 timeline 的草稿 id 追加到末尾。

更新调用：

- `WorldEngineWorkbenchDialog.vue` 保留本地 wrapper 名称，避免模板和现有静态断言大幅改动。
- `world-engine-ide-entry.test.ts` 增加 util 行为断言，并把旧本地实现字符串断言改成新 util 调用断言。

## 验证

运行：

```powershell
bunx vitest run app/utils/world-engine-ide-entry.test.ts
```

结果：

- 1 file passed。
- 3 tests passed。

静态核查：

- `WorldEngineWorkbenchDialog.vue`：2294 行降到 2286 行。
- `world-engine-workbench-real.ts`：528 行增到 559 行。
- 新 util 在 Dialog 和测试中均可搜到。

## 评估

这是小修，不是 Workbench 大拆。它的价值在于：

- 把真实 session 编排中的一个纯规则挪到可测试 Interface 后面。
- 后续拆 `WorldEngineWorkbenchDialog.vue` 时，草稿和时间窗口规则已有可复用 Module。
- 避免先抽大 composable 导致状态、生命周期和 UI 回流一起移动。

## 后续

- 下一轮若继续拆 Workbench，建议评估 `projectQuery()` / timeline query / snapshot query 是否能形成 `WorldWorkbenchApiClient` 或 session composable。
- 如果抽出的 Module 只是一层 `$fetch` pass-through，就不要做；优先找能集中错误处理、请求并发 token、状态回流规则的深 Module。
