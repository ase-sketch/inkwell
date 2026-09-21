# Provider Reasoning Replay

## User Request

- 将 `openai-compatible` 做成主流 OpenAI 兼容 provider 的增强适配器。
- `reasoning_content` 不应只按 DeepSeek 特例处理，MiMo 等 provider 也需要在 Agent 多轮工具调用场景中回传。
- 纯 OpenAI 官方接口使用 `openai-official`。
- 配置允许 `adapter: openai-compatible` 简写，也允许对象形式调节。

## Goal

- `openai-compatible` 默认接收、标准化并回放 provider 返回的 `reasoning_content`。
- `openai-official` 严格遵循 OpenAI 官方字段，不发送 provider extension。
- `thinking` 仍属于模型/profile 调用选项，不进入 adapter 配置。

## Current State

- `adapter` schema 已支持字符串简写和对象形式。
- `openai-compatible` 默认 `reasoningContentReplay: true`，对象形式可关闭。
- `openai-official` 已作为独立 adapter 类型接入。

## Walkthrough

- 先确认 LangChain `ChatOpenAI` 会把响应中的 `reasoning_content` 放入 `additional_kwargs`，但请求序列化不会自动回写。
- 在项目 adapter 边界新增 OpenAI-compatible wrapper，接管 Chat Completions messages 序列化。
- 将 `reasoning_content` 暴露为 LangChain 标准 reasoning content block，同时保留 raw 字段用于 provider 回放。
- 复用通用回放逻辑给 DeepSeek 官方路径，保留 DeepSeek usage/cache 归一化。

## Decisions

- `openai-compatible` 默认开启 reasoning replay，但普通无 reasoning 的工具调用历史不强制报错，避免误伤普通 OpenAI-like provider。
- `deepseek-official` 对已判定为 thinking 的模型继续保持严格校验，旧历史缺失 `reasoning_content` 时提前报错。
- 默认 adapter 配置写回 YAML 时保持字符串，只有非默认调节才写对象。

## Files Changed

- `shared/dto/app-settings.dto.ts`
- `server/utils/app-config.ts`
- `server/utils/model.ts`
- `app/components/novel-ide/settings/NovelIdeModelSettingsPanel.vue`
- `config.example.yaml`
- 当时的旧部署脚本（已删除）
- `README.md`

## Verification

- `bun test server/utils/model.test.ts server/utils/app-config.test.ts`
- `bun run typecheck`

## TODO / Follow-ups

- 后续如新增 profile 级 thinking 参数，应走模型调用选项链路，不放进 adapter。
