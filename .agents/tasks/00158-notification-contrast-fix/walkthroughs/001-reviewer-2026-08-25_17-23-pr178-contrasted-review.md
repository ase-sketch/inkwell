---
schema: nbook.task/v1
taskId: 00158-notification-contrast-fix
sequence: 1
role: reviewer
status: completed
createdAt: 2026-08-25T17:23:13+08:00
---

# 审查记录：PR #178 不满足 Issue #177 核心验收

## 对象

PR #178（fork `nsxzhou:fix/i177-notification-contrast`，commit `d516cf2c`），单文件改动 `NotificationViewport.vue`（43+/32-）。

## 结论：Request changes

1. **对比度方案不成立**：背景 `color-mix(in srgb, ${color} 82%, #000000)` 配固定 `text-white`/`text-white/90`。按仓库 8 套内置主题状态色静态计算（WCAG 相对亮度公式），Dracula/warning ≈ 1.70:1、Catppuccin/warning ≈ 1.92:1、Monokai/info ≈ 2.46:1；普通文本需 ≥4.5:1。PR 声称"color-mix 压暗保证白字对比度"不成立，混合比例扫描显示压到约 45% 才能全体达标，82% 无从谈起。
2. **新增固定黑色违反主题合同**：`#000000` 是业务颜色字面量；主题规范禁止业务组件写固定 hex/rgba，既有宿主外例外只覆盖玻璃拟态与固定反色文字。
3. **无说明移除玻璃拟态**：删 `backdrop-blur-sm` 且新背景不透明，把跨入口玻璃 toast 改成实色卡片；PR 范围声明未含材质变化。

## 已核实事实

- 远端 CI 全绿（Typecheck/Full tests/各平台 Product），但不覆盖运行时视觉对比度。
- PR 无浏览器验收、无新增测试；本地复现其 vitest 配置不收集 `app/utils/theme/**` 测试目录。
- store return 含 `activeThemeAppearance`（novel-ide.ts:1884），后续 advisor 的"未暴露"质疑经读取证据推翻。
