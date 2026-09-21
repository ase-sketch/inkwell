# 00150-ui-spec-verification 上下文快照

生成时间：2026-08-19T07:39:57Z
基线 revision：`679621e5`（本地 master，worktree `.worktree/t150-ui-spec-verification`，分支 `feat/t150-ui-spec-verification`）

注意：本地 master 领先 origin/master 44 个提交（未推送的 t149 monorepo 收敛），origin/master 不含 `packages/nb-ui`，故本任务以本地 master 为基线而非 origin/master。

## 任务背景

用户人工审查 packages/nb-ui 后提出三点：缺 UI 规范、缺 Apple 式设计语言（字体/动画/间距）、缺验证与审查手段。核查结论：

- 规范文档已存在：`docs/design-language.md`（约 930 行判据清单）与 `docs/ui-development-spec.md`（工程合同）；字体、间距（`--space-1..8`）、几何、颜色角色均已登记。
- 真实缺口四项：动效无规范（7 处组件硬编码时长、FormSelect/Dropdown 无入退场过渡）、规范执行无静态检查、e2e 仅 smoke（`lab.spec.ts` 20 行）、截图只存 artifact 无基线比对。

## 已探明现状（计划阶段核实）

- motion token：`src/tokens.css:85-88` root 120/180/220ms + `--ease-standard: cubic-bezier(0.2,0,0,1)`；nbook/macos 90/140/180，aurora 100/160/240，editorial 同 root；reduced-motion 只归零三时长（tokens.css:183-189）。
- 硬编码时长：Dialog.vue:310、Combobox.vue:215/268、ContextMenu.vue:210、Tooltip.vue:89、DialogWindow.vue:181（含 overshoot）、NotificationViewport.vue:62、Tabs.vue:96（无时长）。
- FormSelect SelectContent 与 Dropdown 内容无入退场过渡（只有 chevron 旋转/项 hover）。
- e2e：`playwright.config.ts` port 3100、`e2e/fixtures.ts` console/pageerror 归零守卫；`lab.spec.ts` 仅 smoke + URL 归一化；`shots.spec.ts` 13 张 artifact 截图无断言。
- lab 钩子：`#nb-lab-target`、`aria-label="场景/预览宽度/主题/配色"`、URL 五参数 component/scene/viewport/theme/colorway（`theme=bare` 为裸基线）、`LAB_STYLE_ID="nb-ui-component-lab-overrides"`、`data-nb-lab-active`。
- 仓库无任何 `toHaveScreenshot` 使用；CI（workspace-packages.yml）nb-ui job 不跑 e2e。

## 用户决策

1. 动效：规范章节与实现对齐同批完成（不留债务）。
2. 视觉回归：本地门禁，基线图提交仓库，不改 CI。
3. 治理：登记 Task 00150，不开 GitHub Issue。

## 关键约束与坑

- design-language.md 坑编号只增不改；§互引当前指向 §二/§三/§五，插入新七节后不受影响（实施时 grep 复核）。
- 静态扫描先剥注释再正则（坑 #39）；放宽断言后必须红翻转。
- 探针等待 ≥500ms（坑 #18）；截图前 `bringToFront()`（坑 #41）；Playwright 必须 node 入口（坑 #20，package.json `test:e2e` 已是）。
- Reka Presence 预期等 CSS animation 结束再卸载；不符则退回 `<Transition>` 并记录。
