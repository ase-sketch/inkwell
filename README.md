# Inkwell

**小说创作辅助 agent——用苏格拉底式追问帮作者想清楚设定与剧情，不代写正文。**

Inkwell fork 自 [neuro-book](https://github.com/notnotype/neuro-book)（基座 commit 4590627，一次性取材、不跟进上游），沿用其 agent 运行时、写作工程化（World Engine / 伏笔账本 / llmlint）与编辑器，改造集中在四个点：访谈 profile、会话闸门、作者界面层、阅读模块。本地 Web 应用（Nuxt 4 + Bun），Windows 便携 zip 分发。



## 开发

```powershell
bun install
bun run --cwd packages/neuro-book dev   # http://127.0.0.1:3000/
```

全新环境首跑前（在 `packages/neuro-book` 下）：

```powershell
bun run migrate:deploy
bun run migrate:application-state -- --apply
```

## 打包（Windows 便携版）

```powershell
bun run package:windows-portable   # 产出 neuro-book-windows-x64.zip
```

也可在 GitHub Actions 手动触发 `windows-portable.yml`。

## 文档

- 接手速览：[HANDOFF.md](HANDOFF.md) / [AGENTS.md](AGENTS.md) / [ARCHITECTURE.md](ARCHITECTURE.md)
- 立项五件套与调研：[docs/](docs/README.md)
- 决策记录：[.agents/notes/](.agents/notes/)

## 许可证与致谢

[AGPL-3.0](LICENSE)。基座致谢与 fork 出处见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

[English](README.en.md)
