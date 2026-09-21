# Reference Bookshelf Reorg

## User Request

- 将仓库级 `spec/` 硬切改名为 `reference/`。
- 把 `reference/` 整理成 NeuroBook 系统的详细参考书，只放当前稳定合同、Agent / 人类应读的系统参考和实现真相源。
- `docs/` 收敛为任务 walkthrough、调研、草案、归档和模块背景材料；能成为稳定参考的内容提升到 `reference/`。
- 本轮允许激进整理，但不改变业务行为；除 Import 路径、allowlist、build copy、profile compiled metadata 和测试断言外，主要是文档结构调整。

## Goals

- `spec/` 不再作为 active 文档目录存在。
- `reference/` 成为稳定参考入口，并明确区别于 Project Workspace 内的 `reference/` 外部素材目录。
- Profile `<Import />` 合同切换到 `reference/**`，不保留 `spec/**` 兼容。
- `reference/agent/`、`reference/content/`、`reference/plot/` 清理掉明显历史草图、待确认问题和过长迁移说明。
- active docs、README、PROJECT-STATUS 和 AGENTS 索引不再推荐旧 `reference/...`。

## Migration Map

| From | To |
| --- | --- |
| `spec/` | `reference/` |
| `reference/reference/` | `reference/workspace-reference/` |
| `reference/agent/system.md` | `docs/archived/reference/agent-system-v0.1.md` |
| `reference/plot/system.md` old long version | `docs/archived/reference/plot-system-v0.2.md` |
| `docs/modules/agent/harness.md` | `reference/agent/harness.md` |
| `docs/tasks/18-agent-runtime-pipeline-hooks/HARNESS-BLACK-BOX-CONTRACT.md` | `reference/agent/harness-black-box-contract.md` |
| `docs/tasks/23-agent-sidecar-profile-pass/README.md` stable contract | `reference/agent/sidecar-profile-pass.md` |
| `reference/content/lorebook-information-control.md` | `reference/content/directory-protocol.md` + `reference/content/information-control.md` |
| `docs/drafts/plot-system.md` | `docs/archived/drafts/plot-system.md` |

## Walkthrough

- Created this task walkthrough.
- Renamed root `spec/` to `reference/`.
- Renamed old `reference/reference/` module to `reference/workspace-reference/` during the first pass.
- Updated Import allowlist and Nitro runtime context copy from `spec/` to `reference/`.
- Rewrote `reference/README.md`, `reference/agent/README.md`, and `reference/content/README.md` as Reference Bookshelf entries.
- Added stable Agent runtime references for runtime hooks, sidecar profile pass, and harness black-box behavior.
- Split the old lorebook information-control document into `reference/content/directory-protocol.md` and `reference/content/information-control.md`; archived the old long version.
- Added a new current `reference/plot/system.md` and `reference/plot/README.md`.
- Audited the objective against current files and strengthened stable references that were still too thin:
  - `reference/content/simulation.md` now includes the current `simulator.leader` / `simulator.actor` / `rp.writer` runtime profile contract and `simulation/runs/` boundary.
  - `reference/plot/system.md` now includes DTO fields, status values, `chapterPath` validation, scene ordering, structured ref URI rules and Agent consumption order.
  - Confirmed `docs/modules/agent/harness.md` no longer exists; the current harness reference lives in `reference/agent/harness.md`.
- Cleaned legacy shallow docs that duplicated or contradicted the Reference Bookshelf:
  - Removed `docs/agent/`, `docs/profile/`, and `docs/profile-tsx/` pages after comparing them with `reference/agent/profile-guide.md`, `reference/agent/context.md`, `reference/agent/leader-default.md`, `reference/agent/sidecar-profile-pass.md`, and `reference/agent/harness.md`.
  - Repointed product docs from `/agent/`, `/profile/`, and `/profile-tsx/` pages to stable `reference/agent/` entries.
  - Rewrote `reference/agent/frontend.md` from the old `/api/agent/threads/**` / `subagent` contract to the current `/api/agent/sessions/**` / linked-agent contract.
  - Updated remaining root reference indexes such as `architecture.md` and `CLAUDE.md` from `spec/` to `reference/`.
- Renamed `reference/agent/neurobook-project-guide.md` to `reference/agent/project-workspace-guide.md`.
- Split the Project Workspace directory guide into narrower references:
  - `reference/content/project-structure.md` is now the top-level overview.
  - `reference/content/lorebook.md`, `manuscript.md`, `simulation.md` and `content-references.md` own detailed contracts.
  - `reference/content/directory-protocol.md` is now only a compatibility index.
- Merged the old workspace-reference module into `reference/content/content-references.md` and removed `reference/workspace-reference/`.

## Verification

- `rg -uuu -n "spec/|spec/\\*\\*|reference/agent/system\\.md|reference/content/lorebook-information-control\\.md|reference/reference" assets/workspace/.nbook/agent/profiles workspace/.nbook/agent/profiles server/agent/profiles app/components/profile-template-editor scripts/build`：无 active/profile/runtime 残留。
- `rg -n "spec/|reference/agent/system\\.md|docs/drafts/plot-system|reference/reference|Spec Index|Agent Specs|Content Specs" README.md AGENTS.md PROJECT-STATUS.md docs reference assets server app scripts --glob '!docs/archived/**' --glob '!docs/tasks/archived/**' --glob '!server/agent-v2/**' --glob '!assets/agent-v2/**'`：仅剩本任务自身的迁移说明。
- `bun run test server/agent/profiles/profile-dsl.test.ts server/agent/profiles/workbench-service.test.ts server/agent/profiles/leader-assets-profile.test.ts server/agent/profiles/rp-profiles.test.ts`：4 files / 46 tests passed。
- `bun scripts/build/profile.ts check builtin/leader.default.profile.tsx --system`：passed。
- `bun scripts/build/profile.ts check builtin/leader.assets.profile.tsx --system`：passed。
- Historical verification before the profile-context V2 cut: `bun scripts/build/profile.ts check builtin/leader.rp.profile.tsx --system`：passed。Current checks should target `builtin/simulator.leader.profile.tsx` instead.
- `bun scripts/build/prepare-system-profile-metadata.ts`：prepared 9 system profiles and profile variable IDE types。
- `bun scripts/build/profile.ts compile --all`：compiled 9 workspace user-assets profile artifacts after the user override kept old `spec/**` Import paths.
- `rg -n "docs/(agent|profile|profile-tsx)|\\]\\(/(agent|profile|profile-tsx)" docs README.md reference AGENTS.md PROJECT-STATUS.md architecture.md CLAUDE.md --glob '!docs/archived/**' --glob '!docs/tasks/**' --glob '!docs/drafts/**' --glob '!docs/research/**'`：无 active docs 残留。
- `rg -n "/api/agent/threads|history_sync|assistant_delta|invoke_subagent|create_subagent|subagentThreadId" docs README.md reference AGENTS.md PROJECT-STATUS.md architecture.md CLAUDE.md --glob '!docs/archived/**' --glob '!docs/tasks/**' --glob '!docs/drafts/**' --glob '!docs/research/**'`：仅剩 `reference/agent/frontend.md`、`reference/agent/sse.md`、`docs/operator-bridge.md` 中的明确 removed / old-contract 说明。
- `rg -n "spec/README|spec/agent|spec/content|spec/plot|spec/editor|spec/reference|spec/theme|`spec/`" README.md AGENTS.md PROJECT-STATUS.md docs reference architecture.md CLAUDE.md --glob '!docs/archived/**' --glob '!docs/tasks/**'`：无 active docs 残留。

## Follow-ups

- 后续若需要完全删除旧文件名兼容入口，可移除 `reference/content/lorebook-information-control.md`，但当前保留短跳转以减少断链。
