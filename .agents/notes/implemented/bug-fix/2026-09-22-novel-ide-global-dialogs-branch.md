---
created: 2026-09-22
lifecycle: implemented
class: bug-fix
---

# 新壳全局对话框误置 v-else 分支等三 bug 修复

## Problem
用户手工试用报告三个 bug：①点任意项目弹出两个空白页（about:blank），返回后项目其实已打开；②新壳首页点「设置」齿轮与「账户菜单→个人中心」毫无反应；③agent 面向作者的 prose 泄漏 schema 变量名，普通作者看不懂。

## Decision
- 抽屉空白页：IdeOutlineDrawer/IdeLorebookDrawer 中 `watch(open, ...)` 未声明局部 `open`，解析到全局 `window.open`，Vue 把它当 getter 调用 → 每次打开抽屉同时弹两个 about:blank。改为 `watch(() => props.open, ...)`。
- 设置/个人中心无效：pages/index.vue 模板中 NovelIdeSettingsDialog、NovelIdeProfileDialog 等 9 个全局对话框整块落在新旧壳 `v-else`（旧壳）分支内（新壳 2831-3029 / 旧壳 3031-3257）。默认 isCodexMode=true 时这些组件从不渲染，点击后响应式状态正常翻转但无组件可显示。修复 = 把整板块原样移到根容器直接子级。同时保留两项辅助修复：根容器补 `novel-ide-theme` class（Dialog 默认 teleport 目标 `.novel-ide-theme`），Dialog.vue 增加 resolvedTeleportTarget 找不到目标时降级 body 并 console.warn。
- 文案人性化：leader.default / interview.new-book / interview.stuck 三个 profile 的 System 段增加语言纪律——面向作者的 prose 不得泄漏 schema 字段名，字段名只允许出现在 frontmatter。

## Alternatives considered
- 只修 Dialog teleport fallback（上一轮子代理的方案）：治标不治本——teleport 目标确实缺失过，但真正的阻断是对话框组件根本没挂载；组件树遍历证实渲染树中无这两个组件后被否。
- 在 v-if/v-else 两个分支各放一份对话框：会产生重复实例与状态竞争，否。
- 用 e2e 测试覆盖：当前仓库以 vitest 合约测试为主，改用模板结构契约断言（v-else 分支文本区间内不得出现 9 个全局对话框组件），成本低且能防回归。

## Consequences
- 新壳下设置中心、个人中心、用户资产工作台等 9 个全局对话框/面板全部恢复可用；旧壳行为不变。
- 契约测试锁定模板结构：ide-shell-legacy-entry.contract.test.ts（6 例）、ide-outline.contract.test.ts 回归例、novel-ide-profile.contract.test.ts、interactive-profile-redline.test.ts 文案断言（15 例）。
- 教训沉淀：给既有模板加新顶层分支时，必须审计分支边界外的「全局挂载块」是否被吞进旧分支；Vue 模板缩进不可信，按标签配对数层。

## Confirmation
- bunx vitest run 四个聚焦套件 30/30 绿；bun run typecheck EXIT=0。
- Playwright 实测（msedge）：点设置齿轮 → 配置中心 dialog 弹出、Esc 关闭；账户菜单→个人中心 → dialog 弹出；点项目 0 弹窗。
