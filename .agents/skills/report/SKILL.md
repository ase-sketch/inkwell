---
name: report
description: 汇报长任务交接、阻塞或当前交付证据。
argument-hint: 'Request, file, decision, or task to report'
---

# Report

`$ARGUMENTS` 指定报告对象。仅补充当前报告所需且尚未加载的上下文；只报告不代替执行授权。

## 报告格式

- 当前状态：结论先行，说明实际完成范围。
- 证据：列实际命令、结果、相关文件与未运行项；区分已验证、推断和未知，不把旧证据冒充最新验证。
- 下一步：有阻塞才说明所需决定、背景和影响；无待决事项就完成交付，不制造“回复继续”门禁。

恢复、交付或提交/推送状态相关时，补充 Work/Task/role、授权来源、checkout/branch、HEAD 与验证覆盖 revision、工作树状态、提交范围和未授权远端动作。验证覆盖未提交 diff 时明确无独立 revision。未知写未核实；纯问答不运行全套 Git 检查或查会话日志。

## 完成条件

报告对象与证据对应，基线失败、阻塞和未验证项未被隐藏；无需决定时不提出审批请求。授权边界仍以根 AGENTS.md 与 .omp/RULES.md 为准。
