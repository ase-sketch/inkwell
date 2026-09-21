# ARCHITECTURE.md — Inkwell

> 面向「AI 或新人快速接手」。先讲怎么用，再讲结构。详版见 docs/architecture.md；架构变化时两份必须同步。

## 这是什么

Inkwell 是 fork 自 neuro-book 的小说创作辅助 agent：苏格拉底式追问帮作者想清楚设定/剧情，不代写正文。本地 Web 应用（Nuxt 4 + Bun），Windows 便携 zip 分发，AGPL-3.0 开源。

## 怎么用

- 开发：`bun install` → `bun run --cwd packages/neuro-book dev`，浏览器打开
- 打包（Windows）：`package:windows-portable` → neuro-book-windows-x64.zip（M0 起改名 inkwell）

## 结构一句话

Inkwell = neuro-book 基座（尽量不改）+ 薄改造层。改造只碰四个点：访谈 profile（I1）、会话闸门（I2）、作者界面层（I3，2026-09-21 起从「聊天面板」扩为整壳：Codex 布局骨架 + 暖色编辑风视觉 + 正文/大纲/细纲/设定资产投影）、阅读模块（I4，新增）。基座提供：agent 运行时（neuro-agent-harness + pi-ai BYOK）、写作工程化（world-engine / 伏笔账本 promise / llmlint）、Prisma+SQLite 双 schema 存储。

## 关键设计决策及原因

1. **fork 而非重写**：写作工程化三大件重做成本高。~~代价是必须跟进上游 canary~~ 2026-09-21 拍板：一次性取材、不跟进上游——「基座尽量不改」降级为风险/认知成本控制，不再是跟进义务。
2. **苏格拉底追问靠改 prompt+闸门，不新建模块**：上游已有 request_user_input 工具与前端气泡，只是 prompt 压制了追问频率。
3. **State Root 改默认目录**：避免与上游已装版本抢数据。
4. **分发先 portable zip 不碰 Electron**：上游 desktop 打包还是内部 beta。