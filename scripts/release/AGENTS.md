# scripts/release 目录规则

`scripts/release/` 承载 Inkwell 的产品打包与发布相关脚本。

## 边界与依赖方向
- 本地与便携优先：Inkwell 核心交付物为 **Windows 便携 zip**，不再对接上游的 canary/stable Release 远端或 npm 发布流程。
- 历史隔离：上游历史发布脚本（如 `release.ts`、`manager-release.ts` 等）仅作归档参考，Inkwell 流程严禁依赖或触发它们。

## 底线与验收
- 打包标准流程：本地运行 `bun run package:windows-portable` 或触发 GitHub Actions `windows-portable.yml`，产物为独立便携压缩包。
- 交付与安全红线：未经用户明确要求，严禁在脚本中自动创建 GitHub Release、推送 git tag 或发布云端资产。
- 临时文件隔离：中间 staging、打包过程产物与日志走系统临时根目录，严禁残留到工作区。
