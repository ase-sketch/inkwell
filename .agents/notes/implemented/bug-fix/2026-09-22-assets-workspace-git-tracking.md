# 修复 assets/workspace 整树未入库（.gitignore 通配规则误伤）

Status: implemented
Date: 2026-09-22
相关：HANDOFF.md（仓库与环境节）

## Problem

packages/neuro-book/.gitignore 第 20 行 workspace/ 未锚定根路径，把 assets/workspace/ 整树（profile 源、模板、agents 上下文等 186+ 文件）一并忽略。旧仓库靠「已被跟踪的文件不受 ignore 影响」勉强维持；2026-09-22 仓库重建为单个初始提交后，整树彻底退出 git——克隆或 CI 拿不到任何内置 profile 源文件与模板，仓库不完整。M2a 收口时实测 git ls-files 该目录为 0。

## Decision

- 包级 .gitignore 的 workspace/ 改为 /workspace/（与根 .gitignore:60 的锚定写法对齐；assets/workspace/ 下需排除的运行态已有逐条专门规则兜底：.compiled/、.staging/、skills/llmlint/、agent/assets/ 等）。
- git add packages/neuro-book/assets/workspace 全量补录（尊重既有专门忽略规则）。
- 同一规则还掩盖了 app/components/novel-ide/workspace/ 整目录组件源码（index.vue 直接引用，仓库重建后同样未入库），一并补录；server/agent/harness/workspace/ 为测试运行残留垃圾，删除不入库。
- 顺带撤出 M2a 提交误入库的 .compiled/ 编译产物（41 个文件 git rm --cached）——该目录由构建生成，.gitignore:28 明确不入库。
- 旧文「assets/workspace/ 文件提交需 git add -f」的说法自此作废（HANDOFF.md 已同步回写）。

## Alternatives considered

- 维持逐文件 git add -f：每次新增 profile/模板都要记得强制添加，迟早再漏——被否。
- 把 .compiled 也纳入 git：构建产物入库会让每次 profile 改动都带着哈希噪音 diff，且与 .gitignore:28 的既有意图相反——被否。

## Consequences

- 收益：仓库恢复完整可构建；profile 源、模板与 novel-ide/workspace 组件源码回到正常跟踪，不再需要 git add -f。
- 影响：本次提交一次性补录约 186 个文件（大量是既有内容的首次入库）；M2a 提交（826ef38）中的 .compiled 产物在本提交撤出跟踪。
- 注意：.nbook/agent/profiles/.compiled/ 仍是构建产物目录，本地编译产物不会再出现在 git status。

## Confirmation

- git ls-files packages/neuro-book/assets/workspace 从 0 恢复为全量；git status 不再出现 .compiled 产物噪音；CI windows-portable 打包链下次运行即验证完整性。