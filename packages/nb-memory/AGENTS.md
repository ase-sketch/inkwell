# nb-memory 专属边界

仓库级协作、安全、临时文件和 Git 规则见 [`../../AGENTS.md`](../../AGENTS.md)；本文件只补充 `nb-memory` 的项目边界。

- `@notnotype/nb-memory` 是可注入 port 的 TypeScript/Bun 记忆框架，负责 episode、facts、subject registry、state、检索与相关存储接口；其公开入口保持在 `src/index.ts`。
- 本包维护记忆框架自身的 schema、事件溯源语义、双时间轴查询和索引实现。不要在这里加入 NeuroBook 主应用页面、运行时路径、宿主进程或产品安装逻辑。
- 本包不声明接入 NeuroBook 主应用的产品能力，也不替代主应用现有记忆实现；任何产品采用或跨包合同变更都由根治理协调。
- `nb-memory-bench` 等评测/消费项目不是本包的第二源码树；评测数据、私有语料和运行产物不得作为包内容提交。
- 包内公开包名、exports、脚本和依赖语义属于稳定合同；修改前先核对本包文档与根治理边界。
