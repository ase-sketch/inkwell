# nb-workflow 文档入口

本目录是 `nb-workflow` 自治项目的文档归属入口。当前收编内容是按 S0 import manifest 导入 monorepo 的固定快照；源 checkout 保持不变，项目文档只描述本包自身的 workflow spike 边界，不替代 NeuroBook 根产品文档。

## S0 导入记录

S0 manifest 的 24 个 included 文件按原相对路径复制到本包，并逐文件复核 bytes 与 SHA-256。源 `.gitignore` 与源根 `bun.lock` 按收编约束跳过，因此本包不维护第二份 ignore 或 workspace lockfile。此次只做快照导入和治理入口建立，未在本包运行测试、demo、typecheck、formatter、linter 或项目级构建。

后续项目设计、验证报告或其他文档放在本目录；没有历史文档时不为迁移虚构内容。

共享治理和跨项目合同见 monorepo 根 [`AGENTS.md`](../../../AGENTS.md)。项目 Task 入口见 [`.agents/tasks/README.md`](../.agents/tasks/README.md)。
