---
schema: nbook.task/v1
taskId: 00158-notification-contrast-fix
sequence: 3
role: reviewer
status: completed
createdAt: 2026-08-25T18:00:00+08:00
---

# 审查记录：PR #178 最终结论

## 审查对象与边界

- PR：[#178](https://github.com/notnotype/neuro-book/pull/178)
- 审查 revision：PR head `d516cf2c48575b8ac5840780cf0b8d96253f7e35`
- PR API base revision：`7df31ce3161c81a8375f2dccb47f38c35e57ecd2`
- 当前 `master` 基线：`2116b7ec23a95021571b60935973886b71c142fd`
- PR 当前状态：`closed`，`merged_at: null`；该 patch 未进入当前产品实现。
- 本报告只判断 PR head 的 patch；当前 `master` 的后续实现单独作为功能替代证据，不把替代实现的问题倒灌到 PR 结论。

## 结论：需要修复；已被功能上取代

PR #178 按提交 revision `d516cf2c` 不满足 Issue #177 的对比度验收，不能按原 patch 合并。当前 `master` 已用独立的通知配色实现和回归矩阵覆盖该需求，因此该 PR 已被功能上取代；若继续保留该 PR，应先关闭/重做，而不是合并原 patch。

## 必须修复的问题

1. **对比度保证不成立**（PR head `NotificationViewport.vue` 的 `cardToneStyle`，约 99–104 行）。实现把状态主色按 `82%` 与固定黑色混合，再配固定白字。按仓库 8 套内置主题的状态色计算，`dracula/warning` 约 `1.70:1`、`catppuccin/warning` 约 `1.92:1`、`monokai/info` 约 `2.46:1`；均低于普通文本 WCAG AA 的 `4.5:1`。`text-white/90` 的有效对比度只会更低。该实现不能满足 Issue #177 的“各 tone 下文本对比度满足可读性”。

2. **自定义主题的非法颜色会使整组样式失效**（PR head `statusColors` 与 `cardToneStyle`，约 27–36、99–104 行）。`themeVarsSnapshot` 中只要存在一个非空但非法的状态色，`?? FALLBACK_VARS[key]` 不会回退；随后生成的 `color-mix(...)`、`borderColor` 和徽标 `backgroundColor` 都是无效 CSS，浏览器会丢弃对应声明。当前主题配置归一化只保证值为字符串，不保证颜色语法，因此这是可到达的配置边界。需要在消费边界校验颜色并按主题明暗族回退，不能只处理缺失键。

3. **无授权改变通知材质**（PR head 模板约 125–129 行）。patch 删除了既有 `backdrop-blur-sm`，并用不透明的混合背景替代玻璃 toast；这改变了跨入口通知的视觉合同，但 Issue/PR 范围只声明颜色和对齐优化，没有说明材质切换。应保留既有玻璃拟态，或先单独取得产品决策并更新合同。

4. **固定黑色不符合主题变量合同**（PR head `cardToneStyle` 约 102 行）。业务组件新增 `#000000` 作为背景配方，而主题规范禁止直接写固定业务颜色；宿主外通知的例外只覆盖既有玻璃拟态与固定反色文本，不能扩大为任意固定黑色混色方案。

## 已满足或未能证明的部分

- 使用 `storeToRefs(novelIdeStore).themeVarsSnapshot` 能响应主题快照变化；状态 tone 到 `success/warning/danger/info` 的映射方向正确。
- 标题与消息的条件间距、`items-center` 和 `h-6 w-6` 变更与 Issue 的对齐目标一致，但 PR 没有真实浏览器证据，桌面和窄屏的实际布局仍未验证。
- PR revision 的 GitHub Actions 检查为 8 个成功项（Typecheck、Full tests、治理/文档和 Product 矩阵）；这些检查没有证明视觉对比度或真实浏览器渲染。
- PR 正文明确浏览器人工验收未运行，且没有新增回归测试；前端规范要求用户可见布局/样式变化提供真实页面证据，因此该验证门槛未闭合。

## 当前 master 的边界说明

当前 `master` 已不是 PR #178 的实现：`NotificationViewport.vue` 使用 `notification-tone.ts` 的主题配对与净化逻辑，保留 `backdrop-blur-sm`，并为关闭按钮提供 `aria-label`/`title`；`notification-tone.test.ts` 锁定 8×4 内置主题 WCAG AA 矩阵、非法值回退和旧配方回归。以上是当前实现的独立证据，不修改 PR head 的历史结论，也不把 PR head 的固定黑色、缺少可访问名称或移除 blur 描述成当前 master 的状态。

## 审查范围外

未发现该 patch 新增网络、持久化、权限或 Provider 边界；`v-html` 使用是原有通知路径，本 PR 未扩大其输入来源。未执行远端写入、GitHub review 提交、合并或浏览器人工验收。
