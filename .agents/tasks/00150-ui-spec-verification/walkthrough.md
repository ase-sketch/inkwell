# Task 00150 Walkthrough: nb-ui UI 规范与验证体系补齐

## 任务目标

补齐 nb-ui 的动效规范章节、组件 token 消费静态检查、诊断实验室 e2e 用例与本地视觉回归基线门禁。

---

## 阶段成果与可观察证据

### 阶段 A：动效规范章节
- 在 `packages/nb-ui/docs/design-language.md` 增加「七、动效」独立章节，确立时长刻度（fast 90-120ms, base 140-180ms, slow 180-240ms）、缓动曲线（standard cubic-bezier）与 reduced-motion 降级判据。

### 阶段 B：组件动效与 Token 对齐
- 对齐 7 处硬编码 duration：`Dialog.vue`、`Combobox.vue`、`ContextMenu.vue`、`Tooltip.vue`、`DialogWindow.vue`、`NotificationViewport.vue`、`Tabs.vue`；
- 在 `src/styles.css` 增加 `.nb-ui-popover-motion` modifier，并在 `FormSelect`、`Dropdown` 等组件中支持平滑入退场过渡。

### 阶段 C：Token 消费静态检查
- 新增 `packages/nb-ui/src/components/token-consumption.test.ts`；
- 6 组静态扫描规则覆盖：禁止硬编码 rounded 档位、禁止硬编码时长、禁止字面颜色、禁止无界 transition-all 等；
- 全部 6 组测试通过。

### 阶段 D：/lab 诊断工作台 E2E 全量用例
- `packages/nb-ui/e2e/lab.spec.ts` 覆盖 16 个行为用例：
  1. 首页 smoke
  2. 首屏 URL 归一化
  3. 场景切换与 reload 恢复
  4. 非法 URL 归一化与 replace 历史
  5. theme=bare 裸基线
  6. 4 主题 × 2 配色切换与读数
  7. 变量热覆盖、单项与全部重置
  8. 快照导出为合法 JSON、非法拒入
  9. 数字输入中间态保留、步进 clamp、Enter 提交
  10. 选择器 Enter 展开、富选项、禁用项、焦点归还、body 不锁
  11. 选择器向上展开 data-side=top
  12. 输入框 prefix 渲染与 focus 事件日志
  13. 复选框 fallback 场景布尔值与 focus 事件日志
  14. 事件日志 100 条截流与清空
  15. 离开 /lab 后覆盖层无残留
  16. 1440 与 390 宽度无页面级横向溢出
- 执行结果：16 passed (42.3s)，控制台 error 与 pageerror 归零。

### 阶段 E：视觉回归基线与门禁收口
- 新增 `packages/nb-ui/e2e/visual.spec.ts` 与 13 张本地基线快照：
  - 4 主题 × 2 配色矩阵（8 张）
  - 关键组件基准（4 张：Button、Tabs、SwitchField、SegmentedControl）
  - 390px 窄屏视口基准（1 张）
- 在 `packages/nb-ui/AGENTS.md` 门禁追加 `bun run test:e2e`；
- 执行结果：31 passed (1.2m)。

---

## 门禁验证汇总

在 `.worktree/t150-ui-spec-verification/packages/nb-ui` 依次执行：

1. `bun run test`：15 个测试文件 / 195 个单元与契约测试全部通过；
2. `bun run typecheck`：vue-tsc 检查 0 错误；
3. `bun run build:css`：Tailwind CSS v4 产物一致；
4. `bun run test:e2e`：31 个 E2E 用例全部通过；
5. `git diff --check`：无空白或格式异常。
