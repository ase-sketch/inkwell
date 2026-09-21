# t01 证据：Inline AI 发送 owner 修复验证（2026-09-14）

> 记录位置：已在实现分支 `fix/w00014-inline-ai-send-owner` 提交；登记提交 `5c4fccfc` 已在 `origin/master`。

代码版本：验证在 `0dba865f` 工作树上完成（该树 `packages/neuro-book/app/**`、`shared/**` 与 `origin/master` 的 `26244cf1` 完全一致）；修复现位于分支 `fix/w00014-inline-ai-send-owner`，文件内容与验证时字节一致。
环境：隔离状态根 `<repo>/.local/temp/issue227-state`（demo 项目副本，无启用模型）、`NEURO_BOOK_STATE_ROOT=<state> NUXT_PORT=3010 PORT=3010 bun run dev`（cwd `packages/neuro-book`）、playwright-cli 0.1.17 + headless Chrome 152。

## 1. 门禁

```
$ bun run --cwd packages/neuro-book test -- useInlineEditorAgentController
 Test Files  1 passed (1)
      Tests 1 passed (1)          # 共执行 4 次，均通过；其中 3 次与下一步骤的编辑并行发出，属最终门禁而非严格逐步门禁

$ bun run --cwd packages/neuro-book typecheck
TYPECHECK_EXIT=0
0                                # grep -c "error TS"
```

## 2. 修复前基线（排查阶段，同一 0.10.2 工作树）

- 面板未挂载：点击发送 → 通知「Agent 面板尚未准备好。」，`requests` 中无任何 `/api/agent/*` POST。
- 面板已挂载：点击发送 → 无通知、无请求、输入不清空（静默 `superseded`）。
- 对照组：点击「新建 Inline AI Session」→ `POST /api/agent/sessions` 200（证明 controller 自身 owner 可用）。

## 3. 修复后浏览器实测

面板未挂载时发送（V1）：

```
3569. [GET] /api/agent/sessions?scope=project&projectRoot=demo&profileGroup=all&profileKey=inline.editor&status=active&relation=all&limit=50 => [200]
3570. [POST] /api/agent/sessions/1/invocations => [200]
3571. [GET] /api/agent/sessions/1?view=recovery => [200]
3572. [GET] /api/agent/sessions/1/events?after=7&eventEpoch=3f18feaf-9a69-451c-b37e-3bc6667a070a => [200]

document.body.innerText.includes('Agent 面板尚未准备好') === false
```

`#3570` 响应体（无模型环境的预期形态）：

```json
{
  "sessionId": 1,
  "invocationId": "f48fcd81-ba30-40f1-9770-73c81bafaa53",
  "status": "error",
  "acceptance": {"state": "persisted", "clientMessageId": "8e78a475-...", "entryId": "cef4f7b0-..."},
  "error": "模型未启用或不存在：deepseek/deepseek-v4-flash",
  "errorPhase": "pre_loop",
  "elapsedMs": 438
}
```

面板挂载后发送（V2，即 #227 症状路径）：

```
3591. [POST] /api/agent/sessions/1/invocations => [200]
```

「打开 Session 聊天」（V3）：

```
panels before: 0
panels after:  1
3580. [GET] /api/agent/sessions/1?view=recovery => [200]
3581. [GET] /api/agent/composer-drafts?scopeKey=project:demo&sessionId=1 => [200]
3582. [GET] /api/agent/sessions/1/attachments?offset=0&limit=40 => [200]
3583. [GET] /api/agent/jobs => [200]
```

面板顶部显示 `inline.editor` 徽标与该会话的用户消息，勾选/引用区与 RUN ERROR 卡片正常渲染。

回归（V4）：

```
机器人按钮开合：[data-agent-panel] 1 -> 0 -> 1
「Session 列表」弹窗打开（ref f3e732: 会话列表），Escape 返回后面板仍为 1
playwright-cli console error → Total messages: 44 (Errors: 0, Warnings: 2)
  warning: Timer '[nuxt-app] page:loading:start' already exists   # Nuxt dev 计时噪声
  warning: Timer '[nuxt-app] page:loading:end' already exists
```

## 4. 环境噪声（非代码问题）

首次加载出现 HTTP 500 / 白屏，客户端报 `504 (Outdated Optimize Dep)`（`partial-json.js`、`@tiptap_core.js`）：Vite 共享依赖缓存 `%LOCALAPPDATA%/NeuroBook/cache/vite` 因 `bun.lock` 被其它并行工作改动而重新优化，与 `nuxt typecheck` 的 `.nuxt` 重建同时发生；reload 后恢复正常，与本次改动无关。

## 5. 未执行项

- 真实 Provider/Model 运行（需单独授权）。
- 冷启动 create 分支（隔离状态根中 session 1 已存在）。
- 远端 Issue/Project/PR 写入、push、合并、发布、部署（需单独授权）。
