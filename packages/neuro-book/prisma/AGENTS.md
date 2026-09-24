# prisma 目录规则

## 底线与约束
- **数据隔离**：明确区分 App SQLite 与 Project SQLite，严防两端数据串线。
- **生成代码冻结**：Client 仅由 `bun run generate` 产生，严禁直接手改 `server/generated/`。
- **Migration 纪律**：已进入共享历史的 migration 保持语义不变，所有变更必须通过新增 migration 增量演进；涉及表结构变更时须确保已有数据不被意外丢弃。
- **事务与边界**：数据操作须有明确的成功、失败及事务回滚处理，外部输入在进入持久化前完成校验。
