# Inkwell — 技术栈（tech-stack）

> 这份文档解决什么问题：记录 Inkwell 的技术选型与理由。
> 当前状态：随 fork 锁定的部分**已确认**；分发形态**已拍板：先 portable zip，Electron 后议**（2026-09-20）。

## 随 fork 锁定（2026-09-20 确认，来自 neuro-book 基座 4590627）

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | Nuxt 4 + Vue 3 + Pinia + UnoCSS | 主应用 packages/neuro-book/app/ |
| 编辑器 | TipTap / Milkdown / ProseMirror 双轨 | 另有 monaco-editor、vue-flow 剧情图 |
| 运行时/后端 | Bun + Nuxt/Nitro server | 全仓 bun |
| 存储 | Prisma + SQLite/libsql | App 与 Project 两套 schema，State Root 双根模型 |
| Agent | neuro-agent-harness + pi-agent-core/pi-ai 0.80.6 | Profile 为 TSX DSL；模型层 ≈24 家 provider 模板 |
| 模型接入 | BYOK 多渠道（OpenAI 兼容、DeepSeek 等） | 凭据边界 server/models/provider-credential.ts |
| 许可证 | **AGPL-3.0**（fork 义务，Inkwell 沿用并开源） | nb-ui 为 PolyForm-Noncommercial，非商用无碍 |
| 字体 | Noto Serif SC Variable（@fontsource-variable 打包分发，unicode-range 分片） | 2026-09-21 视觉身份定稿：全局衬线不赌系统字体 |

代价说明：选择 fork 即放弃「自己选栈」的自由——Bun、Prisma、pi-ai 都不是最主流的选择，学习成本计入；换来的是写作工程化三大件与打包链现成。

## 待拍板：分发形态

候选对比：

| 候选 | 优点 | 代价/风险 |
|------|------|-----------|
| **Windows portable zip**（上游主链路） | 上游已验证（package:windows-portable → zip 免安装）；M0 即可交付朋友 | 形态是「本地 Web 服务 + 启动器」，不是桌面 App 体验；**构建须 Windows x64 host——原 Linux 时代走 GitHub Actions windows-latest，现开发机已迁回原生 Windows，CI 打包方案继续沿用** |
| **Electron 桌面壳**（你最初的倾向） | 桌面 App 体验；desktop/electron/ 已有 spike | 上游自述 desktop 打包「内部 beta，未随公开发布」，打包链要自己补齐并维护 |

**推荐**：M0 先走 portable zip 交付（验证最快、朋友能立刻用），Electron 壳作为后续增强项另立里程碑评估——不为内部 beta 的打包链赌 MVP 节奏。
**Plan B**：若 portable zip 链在 M0 也踩坑，退到「手动 bun 起服务 + 浏览器打开」的裸跑方式，安装说明兜底。

## 被排除的选项

- 自建技术栈（Vue/React + Node/Python 从零写）：路线 A 已否决，见 spec.md 参考项目章节。
- Tauri：上游仅有 envelope spike，远不如 Electron spike 完整，且朋友 Windows 环境无额外收益。