# nb-history 包规则

仓库共享协作规则见 [`../../AGENTS.md`](../../AGENTS.md)，本包遵循该入口，不复制共享规则正文。

## 项目专属边界

- `@notnotype/nb-history` 负责 workspace 操作日志、文件历史、快照与审查收件箱能力；本包不拥有 NeuroBook 应用页面、宿主运行时或产品编排逻辑。
- 本目录是从独立 `nb-history` checkout 导入的自治包；包内文档、Task 索引和状态只记录 nb-history 自身，不替代仓库根治理入口。
- 保持 package manifest 的 name、scripts、exports 与依赖语义；需要改变公开合同时，先更新对应项目决策与消费者。
- 测试和演示只使用本包声明的入口，不通过 NeuroBook 应用源码或其他包的 `src/` 深导入。
