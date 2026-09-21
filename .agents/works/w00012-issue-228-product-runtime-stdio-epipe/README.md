---
schema: nbook.work/v1
workId: w00012-issue-228-product-runtime-stdio-epipe
issueId: i228
---

# Issue 228 Product Runtime stdio 断管防护

修复 Product Runtime 在父 shell 或 supervisor 关闭 stdout/stderr 后因 consola、console 或 launcher stdio 写入触发 EPIPE，导致 Product 退出并连带 World Engine 请求失败的问题。保留 State Root JSONL 日志、HTTP 服务、shutdown 与 acceptance lease 生命周期；不修改 World Engine schema/slices、esbuild 或 proper-lockfile 算法。

## 交付边界

- 生产日志 reporter 不依赖不稳定的外部 stdout/stderr，日志主出口为 State Root JSONL。
- `console.warn/error`、`AppFileLogger.write()` 与 `fatalSync()` 的日志失败不递归、不把 EPIPE 变成业务进程退出。
- Product launcher、command wrapper 和 acceptance runner 使用明确的受控 stdio 生命周期，保留 SIGINT/SIGTERM 转发。
- 增加 Windows/Bun Product 回归，覆盖父输出管道关闭后的 `/api/app/version`、World Engine API、shutdown、lease release/reacquire 与竞争 `ELOCKED`。

## 非目标

- 不修改 World Engine schema/slices 业务逻辑。
- 不升级或替换 esbuild。
- 不修改 `proper-lockfile` 算法、`stale`/`update` 参数或 exFAT 租约判定。
- 不调用真实 Provider/Model，不执行远端 Issue/Project/PR 写入、push、合并、发布或部署。
