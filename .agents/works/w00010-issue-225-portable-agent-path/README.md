---
schema: nbook.work/v1
workId: w00010-issue-225-portable-agent-path
issueId: i225
---

# Issue 225 Windows Portable Agent 路径修复

修复 Windows Portable Product 首次调用 Agent 时，`leader.default` Profile 导入 `AGENTS.md` 触发 `The "paths[0]" property must be of type string, got undefined` 的运行时路径合同；保证 Product/Portable 显式使用 Installation Root 作为 Repository Root，并在缺少必要根时明确 fail closed。Work 还负责补齐 Product/Portable 回归验证和 Issue 诊断闭环，但不包含独立的 Manager `yaml`/`semver` 发行依赖修复。

## 关联规范

- [Agent 资产运行期安装与 Catalog 根](../../../docs/specs/agent/asset-install-runtime.md)
- [Agent Profile Import](../../../packages/neuro-book/assets/reference/agent/profile-import.md)
- [Product Runtime Image ADR](../../../packages/neuro-book/docs/adr/0009-product-runtime-image-generation.md)
- [Windows Desktop Productization ADR](../../../packages/neuro-book/docs/adr/0014-electron-desktop-productization.md)

## 交付边界

- Product Runtime 环境合同：显式传递正确的 `NEURO_BOOK_REPOSITORY_ROOT`；不依赖 bundle 中缺失的 `import.meta.dirname`，不回退到 cwd。
- Profile Import 失败语义：缺少 Product Repository Root 时返回明确诊断，不把 `undefined` 传给 `path.resolve`。
- 聚焦回归测试：覆盖 Product environment、Profile Import 与 Product bundle fallback 合同。
- 真实验证：重建或使用当前 Product/Portable 载荷，首轮 `leader.default` 调用不得在路径阶段失败。

## 非目标

- 不在本 Work 内修复 Manager 的 `yaml`/`semver` external 依赖闭包；另建独立 Work/Issue。
- 不改变 Agent Import 允许的路径集合、State Root Reference/Install Root 所有权、Profile DSL 公共 API 或 Provider 配置合同。
- 不运行真实 Provider/Model，不写入 Provider 凭据，不执行数据库迁移、发布、部署、push、PR、合并或关闭 Issue。
- 不把 State Root、Product Runtime Image 或开发机 checkout 误用为 Portable Repository Root。
