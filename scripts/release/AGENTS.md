# scripts/release 目录规则

- 中间 staging、browser smoke、pack 与验证日志使用系统临时根；最终发布资产遵循既有 release output 合同。
- 修改发布复制闭包、安装器路径、workflow 命令或版本身份时，同步对应 contract test 和工作流断言。
- 未经用户批准，不运行发布、不推送资产、不创建 Release、不删除历史发布数据。

## Inkwell 发布流程（2026-09-22 起）

- Inkwell 只走 **Windows 便携 zip**：本地 `bun run package:windows-portable`，或 GitHub Actions 手动触发 `windows-portable.yml`（只产候选产物，不建 Release、不打 tag）。
- 上游的 canary/stable Release 流水线（`release.ts`、RELEASE.md  changelog、vitepress changelog、notnotype/neuro-book 远端）已随仓库重建废弃；本目录里 source/product/manager 相关脚本保留仅供参考，使用前需重新评估。
