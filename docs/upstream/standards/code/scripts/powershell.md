# PowerShell 与 CMD 规范

适用：`*.ps1`、`*.psm1`、`*.cmd`、`*.bat`，当前主要位于 `scripts/install/**` 与验收脚本。

- 发行 PowerShell 兼容 Windows PowerShell 5.1：使用 `[CmdletBinding()]`、显式 `param`、`$ErrorActionPreference = "Stop"`、`$PSScriptRoot` 与 `-LiteralPath`。
- 外部程序使用调用运算符和参数数组，立即检查并传递 `$LASTEXITCODE`；路径和用户输入不进入 `Invoke-Expression`。异常包含操作、目标和原始原因，清理放入 `finally`。
- 含非 ASCII 的发行 `.ps1` 使用 UTF-8 BOM；明确要求无 BOM 的外置 Host 脚本保持 ASCII。文件读写显式选择与目标合同一致的编码。
- 凭据和敏感正文不放入 argv、环境变量、进程标题或日志。下载、解包和复制路径先做完整性与 containment 检查。
- `.cmd` 只做带引号的宿主启动和退出码转发；复杂逻辑进入可测试的 PowerShell 或 TypeScript 入口。

完成标准：脚本可在 Windows PowerShell 5.1 解析和运行，含空格路径正确，外部退出码原样传播，失败后临时资源被清理。