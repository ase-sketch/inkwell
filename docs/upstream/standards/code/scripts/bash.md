# Bash 与 POSIX Shell 规范

适用：`*.sh` 和容器 shell 入口。

- Bash 脚本使用明确 shebang、`set -euo pipefail`、带引号的参数展开和数组；确需 POSIX `sh` 时只使用 POSIX 语法。
- 临时目录由系统工具创建并用 `trap` 清理。输入文件、依赖命令和目标路径在执行副作用前验证。
- 错误写入 stderr，正常机器输出保持稳定；被调用程序退出码必须保留。不用 `eval` 拼命令，不把秘密放进 argv 或 trace。
- 产品和文档明确区分 Git Bash、WSL、Linux 与 PowerShell；平台专属流程提供对应宿主命令。

完成标准：脚本通过目标 shell 语法检查，空格和特殊字符路径正确，失败退出码可观察，临时资源在正常与异常路径均被清理。