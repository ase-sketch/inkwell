# M0 执行决策：Windows 打包走 GitHub Actions + 两处 fork 环境补丁

- **日期**：2026-09-20
- **分类**：决策
- **背景**：M0 执行中发现两个立项时未覆盖的事实：① 本机已弃 Windows，而上游 portable 打包链有硬平台门禁（packagePortable 要求 win32 x64 host；product 不支持交叉包装），本地无法出 zip；② /mnt/e(ntfs3)→ext4 的 node_modules 符号链接使 profile 编译器拿到 realpath 后无法映射逻辑根，14 个 builtin profile 全部 compile_failed。
- **决定**：
  1. Windows 打包走 GitHub Actions windows-latest runner（复用上游 release-container.yml 的 windows job），CI 出 zip + 冒烟（起服务、curl 验证响应）；不用 Wine（无代表性）。验收②改为「CI 冒烟绿 + 朋友实机试用」。已回写 docs/milestones.md、docs/tech-stack.md、HANDOFF.md。
  2. fork 环境补丁：runtime-artifact-compiler-context.ts 的 sourcePathMappingsFor 增补 node_modules realpath 映射（commit 64a81dc，非符号链接环境行为不变，可回馈上游）。
  3. 安装态 root locators 品牌段 NeuroBook→Inkwell 一并改掉（contracts/installation.ts，commit e6b7686），否则安装态数据根仍落 NeuroBook，「数据目录独立」不成立。
- **理由**：公开仓库 Actions 免费且用户正要开源；realpath 补丁是让基座在我们文件系统布局下运行的最小兼容改动，不碰行为语义。
- **影响范围**：M0 验收口径；后续每个里程碑的 Windows 出包都走 CI；跟进上游时 realpath 补丁需留意冲突（上游若修复可弃）。
- **被否决方案**：本地 KVM Windows VM（装机重、一次性投入大）；朋友机实机构建 zip（首次构建风险留到验收时）；退 Plan B 裸跑分发（用户体验差）；CI 暂不加冒烟（用户最终拍板要加）。

## 附：执行中发现的两个环境坑（后续会话直接用）

1. **file: 依赖是拷贝不是链接**：packages 间 `file:../xxx` 依赖（manager→contracts/test-support/owned-process 等）在 bun install 时被**复制**到包内嵌套 node_modules。改完被依赖包源码后必须删掉对应嵌套副本再 `bun install`，否则测试跑到旧代码（本次 manifest-store 测试因此假失败 4 个）。
2. **send_message 够不到 subagent**：PTC 模式下 send_message 只认 Agent Teams 队友，子代理中途提问无法答复。任务书须把歧义处置写成默认动作，不能写「停下等答复」。

## 演进

- 2026-09-21：用户明确 fork 为**一次性取材**，不跟进上游（upstream 仅作参考框架）。本笔记中「跟进上游时 realpath 补丁需留意冲突」类约束自此作废；「基座尽量不改」的约束力从跟进义务降级为风险/认知成本控制，基座层改动仍须走决策笔记。受影响旧文档（AGENTS.md / ARCHITECTURE.md / docs/{architecture,spec,milestones}.md / HANDOFF.md）已同轮回写。
