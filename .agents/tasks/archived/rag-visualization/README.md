# RAG Visualization

## Relative documents refs

- [docs/tasks/43-subject-rag-memory/README.md](../43-subject-rag-memory/README.md)
- [reference/content/simulation.md](../../../reference/content/simulation.md)
- [PROJECT-STATUS.md](../../../PROJECT-STATUS.md)

## User Request / Topic

- 用户希望新增一个简单版 RAG 可视化入口。
- 第一版不是数据库可视化，不做 SQLite 表、向量、SQL 查询器或底层缓存管理器。
- 范围是 Project 级：用户能看到当前 Project Workspace 中已经存储 / 可被 RAG 使用的数据。
- 第一版目的偏产品体验：让用户明确感觉到 NeuroBook 里有一个 RAG 显示入口，而不是只能从工具和日志里推断 RAG 是否存在。
- 2026-06-08 追加 UI 优化：保留现有左侧 RAG 侧边栏，同时在 `app/components/novel-ide/NovelIdeHeader.vue` 右上角增加独立的 RAG Inspector dialog 入口。这个 dialog 需要重新单独设计，比左侧面板更详细，支持查看向量维数、嵌入模型、条目向量元数据和向量预览，并提供更完整的调试操作。
- 2026-06-08 追加 UI 重写：RAG Inspector 参考 `app/components/novel-ide/plot/workbench/PlotWorkbenchDialog.vue` 的工作台式 UI/UX 重新设计，但不死板照搬剧情工作台。目标是形成 RAG 专用的 Workbench：左侧 subject 浏览，中间 chunk/search 主工作区，右侧详细 inspector 和 debug 操作区。

## Goal

新增 Project 级 RAG 可视化入口，让用户能在当前项目中看到 RAG 相关数据，确认 subject memory 已经进入可查看、可搜索的产品表面。

成功标准：

- 当前 Project 有一个明确的 RAG 入口。
- 用户可以浏览当前 Project 内 subjects 的 RAG 数据概览。
- 用户可以查看每个 subject 的 `events.jsonl` 与 `memory.jsonl` 内容，以“记忆数据”方式呈现，而不是以数据库行方式呈现。
- 用户可以输入 query，使用真实 RAG 搜索链路查看召回结果。
- 用户可以重建当前 subject 或当前 Project 的 RAG 索引。
- 用户可以做基础 CRUD 操作来维护 `events.jsonl` / `memory.jsonl` 事实源。
- 第一版不暴露 SQLite 表结构、raw embedding、任意 SQL、DB 行编辑或底层向量调试面板。
- 追加的 RAG Inspector 目标：
  - Header 右上角有一个独立的 Project RAG Inspector 入口，现有左侧 RAG 面板继续保留。
  - 用户可以查看 Project / subject 的 RAG 索引状态、SQLite 缓存状态、schema version、嵌入模型和向量维数。
  - 用户可以查看当前 subject 的 chunk / entry 元数据，例如 source、topic、sourceKey、chunkIndex、contentHash、createdAt、嵌入模型、维数和向量前 8 维预览。
  - 用户可以在 Inspector 中执行更完整的调试操作：重建、标记 dirty、删除某个 subject 的索引行、清空 RAG SQLite 缓存、清空并重建。
  - Inspector 不返回 API key 等 secret；只展示是否已配置。
  - Inspector UI 第三阶段改为 RAG Workbench：更接近 Plot Workbench 的 dialog shell、header 状态、三栏工作区和右侧 inspector，而不是继续使用简单 tabs 面板。

## Current State

- Subject RAG 第一版已落地，事实源是 `simulation/subjects/{subject-id}/events.jsonl` 与 `memory.jsonl`。
- SQLite + sqlite-vec 缓存位于 `{project}/.nbook/subject-rag.sqlite`，它是可重建索引缓存，不是用户应直接管理的事实源。
- `subject_rag_search` 是真实召回入口，会读取 effective embedding 配置，必要时同步重建 dirty source，然后返回当前 subject 的 events / memory 候选。
- 当前缺少面向用户的 RAG 可视化入口。用户无法在 UI 中直观看到“项目里有哪些记忆数据”“某个 query 会召回什么”。
- 第一版左侧 RAG 面板已实现后，新的缺口是“更详细的 RAG Inspector”：现有面板偏事实源浏览和轻量操作，不适合承载向量条目、SQLite 缓存状态和破坏性 debug 操作。

### Code Reading Notes

这轮阅读了当前相关实现，结论如下：

- RAG 底层入口在 `server/agent/tools/subject-rag-index.ts`：
  - `searchSubjectRag()` 当前只支持单个 subject。
  - 搜索前会读取 dirty state，并按 source hash 同步重建当前 subject 的索引。
  - SQLite 表包含 `subject_rag_meta`、`subject_rag_sources`、`subject_rag_chunks` 和 `subject_rag_vec`，但它们是缓存层，不应成为第一版 UI 的主要显示对象。
  - `subject_rag_vec` 已按 `subject_path` 与 `source_type` partition 搜索，RAG 可视化不能把这些边界抹掉。
- subject JSONL parser 在 `server/agent/tools/subject-memory.ts`：
  - 可直接复用 `parseSubjectEventsJsonl()` 与 `parseSubjectMemoriesJsonl()` 做只读展示校验。
  - 坏 JSONL 会抛出带文件行号的错误，适合作为 subject 粒度错误展示。
- Agent 工具入口在 `server/agent/tools/subject-memory-tools.ts`：
  - `subject_rag_search` 的工具包装层会先调用 `ensureSubjectJsonlReadable()`，再调用 `searchSubjectRag()`。
  - `resolveSubjectPaths()` 目前是该文件内部函数。HTTP API 若要复用真实搜索，应抽出一个可复用 resolver，或新建 Project RAG service，避免从 agent tool 内部复制路径逻辑。
- Project Workspace path 解析已有稳定入口：
  - `server/workspace-files/project-workspace.ts` 提供 `normalizeProjectPath()`、`resolveProjectAbsolutePath()`。
  - `server/workspace-files/novel-workspace.ts` 提供 `resolveWorkspaceRootInput()`，但 RAG API 第一版只服务 Project Workspace，不服务 user-assets。
- 前端主工作台入口：
  - `app/components/novel-ide/mock-data.ts` 中 `NOVEL_IDE_TABS` 当前只有 `files`、`characters`、`outline`。
  - `NovelIdeSidebar.vue` 维护左侧图标入口。
  - `NovelIdeToolPanel.vue` 根据 active tab 渲染 `WorkspaceFilePanel`、`WorkspaceCharacterPanel`、`NovelPlotPanel`。
  - 因此第一版最顺的入口是新增 `rag` tab 和 `NovelRagPanel.vue`，不是新增独立路由。
- API 风格参考：
  - workspace 文件读取使用 `/api/workspace-files/**` + `projectPath` query。
  - Plot 新 API 使用 `/api/projects/plot/**` + `projectPath` query，避免把 `workspace/<project>` 放进 URL path。
  - RAG 可视化建议沿用 `/api/projects/rag/**` + `projectPath` query。
- RAG Inspector 相关现状：
  - `NovelIdeHeader.vue` 右上角当前已有书架、剧本工作台、用户资产 / Profile、Agent / Studio 和用户菜单按钮，RAG Inspector 应加入这组 Project 级工具按钮中。
  - Header 由 `app/pages/index.vue` 挂载并通过 emit 打开 bookshelves / plot workbench 等 dialog，因此 RAG Inspector 也应走 `open-rag-inspector` emit + 页面状态挂载。
  - `subject_rag_meta` 当前写入 `schemaVersion`、`embedding.provider`、`embedding.model`、`embedding.dimensions`，可作为索引级 embedding 元数据来源。第二阶段需要进一步把条目级 embedding 元数据落到 chunk 行上，便于 Inspector 查看“这条 chunk 当时使用的 embedding 配置”。
  - `subject_rag_chunks` 存储 chunk 元数据：`source_type`、`source_path`、`source_key`、`chunk_index`、`topic`、`tick`、`time`、`text`、`content_hash`、`created_at`。
  - `subject_rag_vec` 通过 `rowid` 对应 `subject_rag_chunks.id`，sqlite-vec 提供 `vec_to_json(embedding)`，可以安全读取向量并在后端截断成前 8 维预览。

## Decisions / Discussion

- 第一版定位为 RAG 可视化，不是数据库可视化。
- 查看范围是 Project 级，而不是单个 subject 的内部调试页。
- 当前底层 RAG 是 subject-scoped，所以 Project 级的含义是“在一个 Project 页面里列出所有 subject RAG 数据”，不是第一版就做跨 subject 统一向量召回。
- UI 应优先展示人能理解的记忆对象：
  - subject 列表与记忆概览。
  - events 作为经历流。
  - memory 作为稳定认知。
  - 搜索结果作为 RAG 召回候选。
- 底层 DB 状态只可作为轻量状态提示，例如“索引可用 / 未配置 embedding / 索引错误 / 需要重建”，不展示 raw SQLite 表。
- 第一版提供基础管理操作，但操作对象是 `events.jsonl` / `memory.jsonl` 事实源，不直接编辑 SQLite 缓存。
- RAG 页面可以提供重建索引操作。重建索引应理解为删除 / 刷新缓存后重新从 JSONL 事实源生成索引，而不是手工编辑 DB。
- CRUD 第一版保持基础：
  - events：新增、修改、删除、重排单条 event。
  - memory：新增、修改、删除单条 memory。
  - 修改后必须校验 JSONL，并标记对应 source dirty。
  - 复杂合并、别名推理和自然语言整理仍优先由 `subject_memory_update` / `memory.curator` 维护，RAG 面板第一版不做复杂 curator UI。
- Search tab 必须调用真实 `searchSubjectRag()` 路径。可以为 HTTP API 构造最小 `ToolExecutionContext` 所需的 `workspaceRoot/projectPath`，但不要走前端关键词过滤伪装 RAG。
- 用户决策：
  - 入口命名使用 `RAG`。
  - 第一版不做 Project Search。
  - 第一版提供重建索引操作，也做基础 CRUD。
  - Search 失败不需要专门跳转到 Embedding 设置。
  - 不需要提供“打开源文件”入口。
  - events 允许重排，因为创作过程中可能会调整 subject 背景与经历顺序。
  - 坏 JSONL 只显示错误并禁用对应 source 的 CRUD，不在 RAG 面板提供 raw repair。
  - RAG 面板不创建 / 删除 subject，只管理已有 subject 的 events / memory。
  - CRUD 后只标记 dirty，不自动重建索引。
  - 重建索引提供“当前 subject”和“当前 Project”两个范围；当前 subject 是主操作，全 Project 放在次级菜单。
  - memory update/delete 使用旧 topic 定位，topic 不存在时返回冲突并提示刷新。
  - 删除 events / memory 需要确认。
  - 页面显示轻量索引状态：已同步 / 有修改待索引 / 索引失败。
- RAG Inspector 追加决策：
  - 现有左侧 RAG 侧边栏保留。
  - Header 右上角新增独立入口；dialog UI 重新单独设计，不复用 `NovelRagPanel.vue`。
  - Inspector 默认查看当前 Project，数据范围默认是当前选中 subject，不默认一次性加载全 Project 的所有向量条目。
  - 向量展示使用预览模式：每条 chunk 展示前 8 维，不展示完整 embedding 数组。
  - 条目级 embedding provider/model/dimensions 需要真实落库，不能只从索引级 `subject_rag_meta` 派生展示。
  - Inspector 支持完整调试操作，破坏性操作使用普通二次确认即可。
  - Inspector 显示脱敏后的 base URL host / origin，不显示 query，不显示 API key。
  - Chunk 列表第一版支持 source 筛选和 limit 选择：`100 / 200 / 500`，默认 `200`，先不做复杂分页。
  - `clear-index-cache` 和 `clear-index-cache-and-rebuild` 两个操作都保留；前者放在更危险区域，文案明确“不会自动恢复索引”。
  - 左侧 RAG 面板偏浏览和轻量入口；Inspector dialog 是重量级操作界面，可以承载更多查看、搜索、索引调试和后续重操作。
  - Debug 操作只影响 RAG 缓存或 dirty state，不修改 `events.jsonl` / `memory.jsonl` 事实源。
- RAG Inspector Workbench 重写决策：
  - 参考 `PlotWorkbenchDialog.vue` 的工作台式 shell、自定义 header、顶部模式导航、主体三栏和右侧 inspector 动效，但 RAG 的信息架构独立设计，不套用 story/phase/thread/scene 语义。
  - 本轮允许完整重构前端结构，也允许拆分组件，避免 `NovelRagInspectorDialog.vue` 继续膨胀成大型单文件组件。
  - 布局锁定为：左侧 subject 浏览，中间 chunk/search 结果列表，右侧详细 inspector。
  - 可以前后端一起小改，但后端只补 UI 必需的展示字段，不改变 RAG 索引、搜索和 debug 的核心行为。
  - 现有 Header 入口、左侧 RAG 面板、`/api/projects/rag/inspector`、`/api/projects/rag/search`、`/api/projects/rag/debug` 路径继续保留。

## Proposed UX

入口决策建议：

- 在 Project 左侧图标栏新增 `RAG` 入口。
- `NovelIdeTab` 增加 `"rag"`。
- `NovelIdeSidebar.vue` 新增一个图标按钮，建议使用 `i-lucide-brain-circuit` 或相近 lucide icon。
- `NovelIdeToolPanel.vue` 标题映射新增 `rag: "RAG"`，并渲染 `NovelRagPanel.vue`。
- user-assets 模式不显示 RAG 入口，因为 RAG 第一版只服务 Project Workspace 的 `simulation/subjects/`。
- 如果当前项目没有 `simulation/subjects/`，展示空状态：当前 Project 暂无 subject RAG 数据。

页面结构建议：

```text
RAG
|-- Overview
|   |-- subjects count
|   |-- events count
|   |-- memory count
|   `-- embedding / index availability status
|-- Subjects
|   |-- subject list
|   `-- selected subject detail
|       |-- Events
|       |-- Memory
|       `-- Search in this subject
`-- Project Search
    `-- search current Project subject memories
```

第一版实际建议更小：

- 左侧：subject 列表。
- 右侧：
  - `Events` tab：展示当前 subject 的经历流。
  - `Memory` tab：展示当前 subject 的稳定认知卡片。
  - `Search` tab：输入 query，展示当前 subject 的真实 RAG 召回结果。
  - `Actions` / toolbar：刷新、重建索引，以及新增 event / memory。

暂不做 Project Search。若后续要做 Project Search，应先设计清楚跨 subject 搜索的结果排序和信息边界；第一版可以在页面总览上让用户看到 Project 级所有 subject，但检索动作仍需要选中一个 subject。

## Data Surface

后端建议提供 Project 级 RAG API，而不是让前端直接读 SQLite：

```ts
type ProjectRagOverview = {
    projectPath: string;
    subjects: Array<{
        subjectPath: string;
        subjectId: string;
        eventCount: number;
        memoryCount: number;
        subjectFileExists: boolean;
        mindFileExists: boolean;
        stateFileExists: boolean;
        errors: Array<{
            source: "events" | "memory";
            message: string;
        }>;
    }>;
};
```

```ts
type ProjectRagSubjectData = {
    projectPath: string;
    subjectPath: string;
    subjectId: string;
    events: Array<{
        tick?: string;
        time?: string;
        text: string;
        line: number;
    }>;
    memories: Array<{
        topic: string;
        aliases?: string[];
        view: string;
        line: number;
    }>;
    errors: Array<{
        source: "events" | "memory";
        message: string;
    }>;
};
```

```ts
type ProjectRagSearchInput = {
    subjectPath: string;
    query: string;
    sources?: Array<"events" | "memory">;
    limit?: number;
};
```

```ts
type ProjectRagSearchResult = {
    projectPath: string;
    subjectPath: string;
    candidates: Array<{
        source: "events" | "memory";
        text: string;
        topic?: string;
        tick?: string;
        time?: string;
        rank: number;
        sourcePath: string;
    }>;
};
```

```ts
type ProjectRagRebuildInput = {
    subjectPath?: string;
};
```

```ts
type ProjectRagEventWriteInput = {
    subjectPath: string;
    index?: number;
    event: {
        tick?: string;
        time?: string;
        text: string;
    };
};
```

```ts
type ProjectRagEventReorderInput = {
    subjectPath: string;
    fromIndex: number;
    toIndex: number;
};
```

```ts
type ProjectRagMemoryWriteInput = {
    subjectPath: string;
    topic?: string;
    memory: {
        topic: string;
        aliases?: string[];
        view: string;
    };
};
```

说明：

- 有 `subjectPath` 时，调用真实 `subject_rag_search` 搜当前 subject。
- 第一版要求 `subjectPath` 必填，不做无 subjectPath 的全 Project 搜索。
- `subjectPath` 对 HTTP 调用方应是 Project Workspace 相对路径，例如 `simulation/subjects/player`；后端再转换成 agent 工具需要的 workspace 相对路径，避免前端知道 `{projectSlug}/...` 这层工具 cwd 细节。
- 后端返回 `line` 是为了让 UI 可以显示“第几条记忆”，它不代表 DB row id。
- event 修改 / 删除使用 0-based `index` 定位当前解析后的 event 数组。保存前必须重新读取文件并校验，避免对坏 JSONL 静默覆盖。
- event 重排使用 0-based `fromIndex` / `toIndex`，后端重新读取当前 events 数组后移动对应记录，序列化前完整校验。
- memory 修改 / 删除优先用 `topic` 定位，因为 `topic` 是 `memory.jsonl` 第一版主键。topic 改名时，接口 body 中 `topic` 是旧 topic，`memory.topic` 是新 topic。
- 每个写操作完成后返回最新 subject detail，并标记对应 RAG source dirty。
- rebuild 输入缺少 `subjectPath` 时表示重建当前 Project 下所有 subject；有 `subjectPath` 时只重建当前 subject。
- overview/detail 需要展示轻量 index 状态。第一版状态来自 JSONL hash、dirty state 和 RAG source 记录即可，不展示 SQLite 表。

建议新增 DTO：

- `shared/dto/project-rag.dto.ts`
  - `ProjectRagOverviewDtoSchema`
  - `ProjectRagSubjectDtoSchema`
  - `ProjectRagSearchRequestDtoSchema`
  - `ProjectRagSearchResultDtoSchema`
  - `ProjectRagRebuildRequestDtoSchema`
  - `ProjectRagEventWriteRequestDtoSchema`
  - `ProjectRagEventReorderRequestDtoSchema`
  - `ProjectRagMemoryWriteRequestDtoSchema`

建议新增 service：

- `server/rag/project-rag-visualization.ts`
  - `readProjectRagOverview(projectPath)`
  - `readProjectRagSubject(projectPath, subjectPath)`
  - `searchProjectSubjectRag(projectPath, input)`
  - `rebuildProjectSubjectRag(projectPath, input)`
  - `createProjectRagEvent(projectPath, input)`
  - `updateProjectRagEvent(projectPath, input)`
  - `deleteProjectRagEvent(projectPath, input)`
  - `reorderProjectRagEvent(projectPath, input)`
  - `createProjectRagMemory(projectPath, input)`
  - `updateProjectRagMemory(projectPath, input)`
  - `deleteProjectRagMemory(projectPath, input)`

这个 service 负责 Project path 解析、subject 目录扫描、JSONL 校验、以及把 HTTP search 转成 `searchSubjectRag()` 所需的 subject paths/context。

建议新增 API：

- `GET /api/projects/rag/overview?projectPath=workspace/<project>`
- `GET /api/projects/rag/subject?projectPath=workspace/<project>&subjectPath=simulation/subjects/<id>`
- `POST /api/projects/rag/search?projectPath=workspace/<project>`
- `POST /api/projects/rag/rebuild?projectPath=workspace/<project>`
- `POST /api/projects/rag/events?projectPath=workspace/<project>`
- `PATCH /api/projects/rag/events?projectPath=workspace/<project>`
- `DELETE /api/projects/rag/events?projectPath=workspace/<project>`
- `POST /api/projects/rag/events/reorder?projectPath=workspace/<project>`
- `POST /api/projects/rag/memories?projectPath=workspace/<project>`
- `PATCH /api/projects/rag/memories?projectPath=workspace/<project>`
- `DELETE /api/projects/rag/memories?projectPath=workspace/<project>`

### RAG Inspector Data Surface

RAG Inspector 是第二阶段 UI 优化，目标是展示更详细的索引 / 向量元数据，而不是替代左侧轻量 RAG 面板。

建议新增 DTO：

```ts
type ProjectRagInspectorDto = {
    projectPath: string;
    selectedSubjectPath: string | null;
    sourceFilter: Array<"events" | "memory">;
    limit: 100 | 200 | 500;
    embedding: {
        enabled: boolean;
        provider: string;
        model: string | null;
        dimensions: number | null;
        baseURLConfigured: boolean;
        baseURLLabel: string | null;
        apiKeyConfigured: boolean;
    };
    index: {
        dbExists: boolean;
        schemaVersion: string | null;
        embeddingProvider: string | null;
        embeddingModel: string | null;
        embeddingDimensions: number | null;
        metaMatchesEffectiveConfig: boolean | null;
        sourceCount: number;
        chunkCount: number;
        vectorCount: number;
    };
    subjects: ProjectRagSubjectSummary[];
    selectedSubject: {
        subjectPath: string;
        subjectId: string;
        sourceStatuses: ProjectRagSourceStatus[];
        chunks: Array<{
            id: number;
            source: "events" | "memory";
            sourcePath: string;
            sourceKey: string;
            chunkIndex: number;
            topic: string | null;
            tick: string | null;
            time: string | null;
            text: string;
            contentHash: string;
            createdAt: string;
            vector: {
                exists: boolean;
                dimensions: number | null;
                preview: number[];
                previewDimensions: number;
                embeddingProvider: string | null;
                embeddingModel: string | null;
                embeddingDimensions: number | null;
                embeddingIndexedAt: string | null;
            };
        }>;
        chunksTruncated: boolean;
    } | null;
};
```

```ts
type ProjectRagDebugRequest = {
    action:
        | "mark-dirty"
        | "delete-subject-index"
        | "clear-index-cache"
        | "clear-index-cache-and-rebuild";
    subjectPath?: string;
    sources?: Array<"events" | "memory">;
};
```

```ts
type ProjectRagDebugResult = {
    projectPath: string;
    action: ProjectRagDebugRequest["action"];
    message: string;
    rebuild?: ProjectRagRebuildResult;
};
```

说明：

- `embedding.apiKeyConfigured` 只能表示是否已配置，不能返回 API key。
- `embedding.baseURLLabel` 显示脱敏后的 base URL host / origin，例如 `https://api.example.com`；不显示 query，不显示 key，不把完整敏感 URL 写入 UI。
- `index.metaMatchesEffectiveConfig`：
  - `true` 表示 SQLite meta 中的 provider/model/dimensions 和当前 effective embedding 配置一致。
  - `false` 表示索引使用的 embedding 配置已变化，需要清空并重建。
  - `null` 表示 DB 或 meta 不存在，无法判断。
- `selectedSubject.chunks` 默认最多返回 200 条，前端可切换 `100 / 200 / 500`；超过则 `chunksTruncated = true`。
- 每条 chunk 的向量预览由后端读取 `vec_to_json(embedding)` 后截断为前 8 维；不返回完整向量数组。
- 每条 chunk 的 `embeddingProvider`、`embeddingModel`、`embeddingDimensions`、`embeddingIndexedAt` 必须真实落库，表示这条 chunk 写入向量缓存时实际使用的 embedding 配置。

建议新增 API：

- `GET /api/projects/rag/inspector?projectPath=workspace/<project>&subjectPath=simulation/subjects/<id>&sources=events,memory&limit=200`
- `POST /api/projects/rag/debug?projectPath=workspace/<project>`

`debug` 操作语义：

- `mark-dirty`：`subjectPath` 可选；有值时标记当前 subject，缺省时标记 Project 全部 subject；`sources` 缺省为 `events + memory`。
- `delete-subject-index`：必须传 `subjectPath`，删除 SQLite 中该 subject 的 `sources / chunks / vec rows`，不删除事实源 JSONL。
- `clear-index-cache`：删除 `.nbook/subject-rag.sqlite` 及同名 `-wal`、`-shm` 文件。
- `clear-index-cache-and-rebuild`：清空缓存后调用现有 rebuild；`subjectPath` 可选，有值时只重建当前 subject，缺省时重建 Project。

## Boundaries

第一版不做：

- SQLite 数据库浏览器。
- raw embedding 展示。
- 任意 SQL 查询。
- 向量距离高级调参。
- RAG 数据编辑器。
- lorebook / Project 全局 RAG。
- GraphRAG。
- 跨 subject 混合召回后直接给 actor 使用。
- user-assets RAG。
- 打开源文件入口。
- Search 失败时跳转或深链到 Embedding 设置。
- 直接编辑 SQLite 缓存或 raw embedding。
- 第一版 CRUD 不做自然语言 merge、复杂批量编辑或 curator patch 预览。
- subject 创建 / 删除。
- 坏 JSONL raw repair。
- RAG Inspector 仍不做任意 SQL 查询器。
- RAG Inspector 不展示完整 raw embedding 数组，只展示前 8 维预览。
- RAG Inspector 不把 SQLite 表暴露为可编辑数据库表。
- RAG Inspector 不提供直接修改 `subject_rag_chunks`、`subject_rag_sources` 或 `subject_rag_vec` 单行字段的能力。
- RAG Inspector 不返回 API key 等 secret。
- RAG Inspector 第一版不做复杂分页，只做 source 筛选和 `100 / 200 / 500` limit。

第一版必须保持：

- 事实源仍是 `events.jsonl` / `memory.jsonl`。
- 搜索调试走真实 RAG 搜索链路，而不是前端字符串过滤冒充 RAG。
- Project 级入口可以看到多个 subject，但每条数据必须带清楚 subject 来源。
- embedding 未配置时，搜索区域显示明确状态，不偷偷 fallback 到关键词搜索。
- 坏 JSONL 不能拖垮整个 Project RAG 页面；只标记对应 subject / source 错误。
- RAG 面板不读取旧 `events.md` / `knowledge.md`，继续遵守 Task 43 hard cut。
- CRUD 只操作 JSONL 事实源；成功后标记 dirty，让后续搜索或重建索引从事实源同步。
- CRUD 后不自动调用 embedding，不自动重建索引。
- 重建索引不能吞掉源文件校验错误。若某个 subject JSONL 无效，应返回该 subject/source 的错误。
- events 重排必须保持记录内容不变，只改变顺序。
- RAG Inspector 的破坏性 debug 操作必须二次确认。
- 删除缓存 / 删除 subject index 只影响可重建缓存，不影响 `events.jsonl` / `memory.jsonl`。
- 如果索引 meta 与当前 embedding 配置不一致，UI 应明确提示需要清空并重建，不应静默使用旧索引。
- 条目级 embedding 元数据必须随 chunk 写入缓存；后续查看 chunk 时不能只用当前配置或索引级 meta 代替。

## Implementation Plan

### 1. Shared DTO

- 新增 `shared/dto/project-rag.dto.ts`。
- 用 Zod 定义 overview、subject detail、search request/result。
- subjectPath 使用 Project Workspace 相对路径，第一版必须位于 `simulation/subjects/{id}`。

### 2. Backend Project RAG Service

- 新增 `server/rag/project-rag-visualization.ts`。
- 使用 `resolveProjectAbsolutePath(projectPath)` 定位 Project Workspace。
- 扫描 `simulation/subjects/*` 目录。
- 读取 `events.jsonl` / `memory.jsonl`，复用 `parseSubjectEventsJsonl()` 与 `parseSubjectMemoriesJsonl()`。
- 读取失败或 JSONL 解析失败时，把错误收敛到 subject/source errors，不让 overview 整体失败。
- 把 `events` 和 `memory` 加上 1-based line 序号，方便 UI 展示。
- 提供 events / memories 的基础 CRUD。写入时复用 `serializeSubjectEventsJsonl()`、`serializeSubjectMemoriesJsonl()`，并调用 `markSubjectRagDirty()`。
- 提供 event reorder。重排只移动解析后的 event item，不修改 event 内容。
- 如果某个 source 当前 JSONL 无效，该 source 的 CRUD / reorder API 返回冲突，要求先修复源文件。

### 3. Search API

- 新增 Project RAG search API。
- 第一版只支持 `{ subjectPath, query }`，内部调用真实 `searchSubjectRag()`。
- 为 HTTP API 构造最小 `ToolExecutionContext`：
  - `workspaceRoot` 指向 Workspace Root container。
  - `projectPath` 使用 query 中的 Project Path。
  - 其他 Agent-only 字段不应被 `searchSubjectRag()` 读取；如果类型不允许，优先把 `searchSubjectRag()` 的配置读取参数下沉为更小的 runtime context，而不是在 API 里伪造完整 harness。
- 抽出 subject path resolver，避免复制 `subject-memory-tools.ts` 的内部 `resolveSubjectPaths()`。
- 若 embedding 未配置或索引失败，返回用户可理解的错误状态。

### 4. Rebuild API

- 新增 Project RAG rebuild API。
- subjectPath 为空时，扫描当前 Project 全部 subject 并逐个重建。
- subjectPath 非空时，只重建指定 subject。
- 实现策略可以是：
  - 标记对应 events / memory dirty 后触发一次真实 `searchSubjectRag()` 预热；或
  - 抽出底层 rebuild 函数直接重建 sources。
- 第一版更偏用户操作反馈，建议返回：
  - rebuilt subject 数。
  - skipped subject 数。
  - 每个失败 subject/source 的错误。
  - 是否因为 embedding 未配置而无法重建。

### 5. Backend API Routes

- 新增：
  - `server/api/projects/rag/overview.get.ts`
  - `server/api/projects/rag/subject.get.ts`
  - `server/api/projects/rag/search.post.ts`
  - `server/api/projects/rag/rebuild.post.ts`
  - `server/api/projects/rag/events.post.ts`
  - `server/api/projects/rag/events.patch.ts`
  - `server/api/projects/rag/events.delete.ts`
  - `server/api/projects/rag/events/reorder.post.ts`
  - `server/api/projects/rag/memories.post.ts`
  - `server/api/projects/rag/memories.patch.ts`
  - `server/api/projects/rag/memories.delete.ts`
- 路由统一使用 `projectPath` query。
- body / response 使用 `shared/dto/project-rag.dto.ts` 校验。
- 后续如维护 OpenAPI，需要同步 `server/openapi/route-map.ts`。

### 6. Frontend Entry

- 在 Project UI 增加 RAG 可视化入口。
- 更新 `app/components/novel-ide/mock-data.ts`：`NOVEL_IDE_TABS` 增加 `"rag"`。
- 更新 `NovelIdeSidebar.vue`：新增 RAG icon，user-assets 模式隐藏。
- 更新 `NovelIdeToolPanel.vue`：新增标题和 `NovelRagPanel.vue` 分支。
- 页面展示 subject 列表、events、memory 和 search。
- 使用紧凑、工具型布局，避免做成营销页。

### 7. NovelRagPanel

- 新增 `app/components/novel-ide/rag/NovelRagPanel.vue`。
- 直接从 `useNovelIdeStore()` 读取 `currentNovelId`。
- 加载 overview 后默认选中第一个无解析错误的 subject；若没有，则选中第一个 subject 或展示空状态。
- Tabs:
  - `Events`：按时间/行号展示经历流。
  - `Memory`：按 topic 展示稳定认知卡片，aliases 做小标签。
  - `Search`：输入 query，调用真实 search API，展示 source/topic/tick/time/rank。
- Events tab 提供新增、编辑、删除单条 event。
- Events tab 提供重排 event；可用上移 / 下移按钮或拖拽，第一版优先实现更稳定的上移 / 下移。
- Memory tab 提供新增、编辑、删除单条 memory。
- 顶部 toolbar 提供刷新和重建索引。
- 重建索引主按钮作用于当前 subject；全 Project 重建放在次级菜单。
- 删除 events / memory 前弹出确认。
- CRUD 成功后显示“有修改待索引”状态，不自动调用 embedding。
- 搜索失败只显示错误文案，不提供 Embedding 设置跳转。
- 不提供“打开源文件”按钮。

### 8. Empty / Error States

- 无 subject：显示当前项目暂无 subject RAG 数据。
- subject JSONL 无效：显示具体文件和错误摘要。
- subject JSONL 无效：禁用对应 source 的新增、编辑、删除和重排。
- embedding 未配置：Search tab / rebuild 操作显示错误文案。
- RAG search 失败：展示错误，不影响 events / memory 浏览。
- 当前处于 user-assets 或没有 Project 时：入口不显示；若组件被直接挂载，则显示“当前没有 Project Workspace”。

### 9. Verification

- 后端 API test：无 subjects 时返回空列表。
- 后端 API test：合法 `events.jsonl` / `memory.jsonl` 能被读取并计数。
- 后端 API test：坏 JSONL 只影响对应 subject。
- Search API test：有 subjectPath 时调用真实 RAG 搜索路径。
- CRUD API test：event 新增 / 修改 / 删除后 JSONL 合法，并标记 events dirty。
- CRUD API test：event 重排后 JSONL 合法，记录内容不变，并标记 events dirty。
- CRUD API test：memory 新增 / 修改 / 删除后 JSONL 合法，并标记 memory dirty。
- Rebuild API test：指定 subject 重建会走真实 RAG 索引路径；embedding 未配置时返回明确错误。
- 前端基础状态 test：空状态、subject 切换、events/memory 渲染、搜索错误提示。
- 窄验证优先，不要求第一版做浏览器验收；如需要浏览器验收，单独由用户确认。

### 10. RAG Inspector DTO / Service

- 扩展 `shared/dto/project-rag.dto.ts`：
  - `ProjectRagInspectorDtoSchema`
  - `ProjectRagDebugRequestDtoSchema`
  - `ProjectRagDebugResultDtoSchema`
- 扩展 `server/agent/tools/subject-rag-index.ts` 的 SQLite schema：
  - 升级 schema version，例如从 `subject-rag-v2` 到 `subject-rag-v3`。
  - `subject_rag_chunks` 增加条目级 embedding metadata 字段：
    - `embedding_provider TEXT`
    - `embedding_model TEXT`
    - `embedding_dimensions INTEGER`
    - `embedding_indexed_at TEXT`
  - 写入 chunk 时保存当前 `RagEmbeddingModel` 的 provider/model/dimensions 和 indexedAt。
  - `ensureRagMeta()` 仍保留索引级 meta，用于判断整个 DB 是否与当前配置一致；chunk 级字段用于 Inspector 展示条目实际写入时的配置。
- 扩展 `server/rag/project-rag-visualization.ts`：
  - `readProjectRagInspector(projectPath, subjectPath?)`
  - `debugProjectRag(projectPath, input)`
- Inspector service 复用现有 Project path / subject path 解析逻辑。
- Inspector 读取 effective embedding config 时使用 `loadEffectiveConfigForAgentRuntime()`，并对 secret 做脱敏。
- Inspector 以只读方式打开 `.nbook/subject-rag.sqlite`：
  - 读取 `subject_rag_meta` 得到 schema version 与 embedding provider/model/dimensions。
  - 读取 `subject_rag_sources` 汇总 source count、record count、indexedAt、lastError。
  - 读取 `subject_rag_chunks` 和 `subject_rag_vec` 得到当前 subject chunk 列表、条目级 embedding metadata 和向量预览。
  - 使用 `vec_to_json(embedding)` 得到向量 JSON，再截断前 8 维返回。
- 如果 SQLite 文件不存在、schema 不存在或读取失败，Inspector 不应拖垮整个 dialog；返回可展示的错误 / 空状态。

### 11. RAG Inspector API

- 新增：
  - `server/api/projects/rag/inspector.get.ts`
  - `server/api/projects/rag/debug.post.ts`
- API 统一使用 `projectPath` query。
- `inspector.get` 的 `subjectPath` query 可选；缺省时后端选择第一个无解析错误 subject，否则第一个 subject。
- `inspector.get` 支持 `sources=events,memory` 和 `limit=100|200|500` query；缺省为 `events,memory` + `200`。
- `debug.post` 使用 body action 区分操作。
- `debug.post` response 使用 DTO 校验。
- 同步 `server/openapi/route-map.ts`，登记 inspector / debug 新接口。

### 12. RAG Inspector Frontend

- 新增 `app/components/novel-ide/rag/NovelRagInspectorDialog.vue`。
- 在 `NovelIdeHeader.vue` 增加右上角 RAG Inspector 按钮：
  - 非 user-assets 模式显示。
  - emit `open-rag-inspector`。
  - 文案建议 `RAG`，title 使用 `RAG Inspector`。
- 在 `app/pages/index.vue`：
  - 新增 `ragInspectorOpen` state。
  - 监听 Header `open-rag-inspector`。
  - 挂载 `NovelRagInspectorDialog`，传入当前 Project。
- Dialog 重新单独设计：
  - 顶部摘要：Project、subject 数、chunk 数、vector 数、embedding model、dimensions、索引一致性。
  - 左侧 subject 列表：显示 event/memory count、source status、错误摘要。
  - 右侧 tabs：`Status`、`Chunks`、`Search`、`Debug`。
  - `Chunks` 默认展示当前 subject chunk，向量预览为前 8 维；提供 source 筛选和 `100 / 200 / 500` limit。
  - `Chunks` 展示条目级 embeddingProvider / embeddingModel / embeddingDimensions / embeddingIndexedAt，而不是只展示当前配置。
  - `Search` 调用现有真实 search API，不做前端关键词 fallback。
  - `Debug` 提供 mark dirty、delete subject index、clear cache、clear and rebuild 等操作。
  - `clear-index-cache` 和 `clear-index-cache-and-rebuild` 都保留；`clear-index-cache` 放在危险区域，文案明确不会自动恢复索引。
  - 破坏性操作使用普通确认 dialog，并在操作成功后刷新 inspector。

### 12.1 RAG Inspector Workbench Rewrite

- 将 `NovelRagInspectorDialog.vue` 从单文件 tabs 面板重写为 RAG Workbench。
- Dialog 外壳：
  - 使用 `Dialog size="workbench"`、`overlay-type="blur"`、`:close-on-overlay="false"`、`:show-footer="false"`、`body-class="!gap-0 !overflow-hidden !p-0"`。
  - 使用自定义 header，显示 RAG Inspector、当前 project、当前 subject、embedding model/dimensions、索引状态点和刷新按钮。
  - 视觉可参考 `PlotWorkbenchDialog.vue` 的 `workbench-accent-icon`、顶部状态点、紧凑工具按钮和 inspector slide transition。
- 组件拆分：
  - `NovelRagInspectorDialog.vue`：数据加载、状态协调、二次确认 dialog、整体 workbench shell。
  - `NovelRagInspectorSidebar.vue`：subject 列表、event/memory 数量、source 状态、JSONL 错误摘要。
  - `NovelRagInspectorMain.vue`：中间主区，提供 `Chunks` / `Search` 模式、source filter、limit、chunk 选择、搜索结果列表。
  - `NovelRagInspectorDetail.vue`：右侧 inspector，展示 Project/Subject/Index/Embedding 状态，选中 chunk 或 search candidate 后展示详情，并承载 debug 操作。
- 中间主区：
  - 默认模式为 `Chunks`，展示当前 subject 的 chunk 列表。
  - `Search` 调用现有真实 search API，不做前端关键词 fallback。
  - 切换 subject/source filter/limit 时重新加载 inspector，并清空选中 chunk 与旧 search result。
- 右侧 inspector：
  - 未选 chunk 时展示 Project / Subject / Index / Embedding 摘要。
  - 选中 chunk 时展示 source、sourceKey、chunkIndex、topic/tick/time、contentHash、createdAt、embedding provider/model/dimensions/indexedAt、vector dimensions 和前 8 维 preview。
  - Search result 点击后右侧展示 candidate 详情，但不伪装成 SQLite vector row。
  - Debug 操作放在右侧操作区；危险操作仍二次确认。
- DTO / service 小幅补充：
  - `ProjectRagInspectorDto.index.readError: string | null`：SQLite 存在但读取 meta/chunk 失败时用于 UI 展示，不把 dialog 拖垮。
  - `ProjectRagInspectorDto.selectedSubject.chunkSourceCounts: {events: number; memory: number}`：右侧摘要和 source filter 计数使用。
  - 保持不返回完整 raw embedding，不暴露 API key，不提供任意 SQL，不编辑 SQLite 行。

### 13. RAG Inspector Verification

- 后端 test：
  - 无 SQLite 缓存时 inspector 返回 `dbExists=false`、chunks 为空，但仍返回 subject overview。
  - 已完成索引后 inspector 返回 schemaVersion、embedding model、dimensions、chunk count、vector count、向量前 8 维 preview。
  - chunk 行真实落库条目级 embeddingProvider / embeddingModel / embeddingDimensions / embeddingIndexedAt，并能被 inspector 返回。
  - embedding 配置变化时 `metaMatchesEffectiveConfig=false`。
  - `sources` 筛选和 `limit=100|200|500` 生效，超出时返回 `chunksTruncated=true`。
  - `mark-dirty` 能标记当前 subject / Project dirty。
  - `delete-subject-index` 只删除指定 subject 索引行，不影响 JSONL。
  - `clear-index-cache` 删除 sqlite / wal / shm 文件。
  - `clear-index-cache-and-rebuild` 在 embedding 配置存在时能重建，失败时返回已有 rebuild message。
- 前端 contract test：
  - Header 包含 RAG Inspector 入口，并在 user-assets 模式隐藏。
  - `index.vue` 挂载 `NovelRagInspectorDialog` 并响应 `open-rag-inspector`。
  - Dialog 调用 `/api/projects/rag/inspector` 与 `/api/projects/rag/debug`。
  - Dialog 文案包含向量维数、嵌入模型、向量预览、chunk 元数据、清空缓存、标记 dirty 等关键能力。
  - Workbench 重写后，Dialog contract 还应确认 `size="workbench"`、`overlay-type="blur"`、拆分组件导入、`Chunks` / `Search` 主模式、右侧 inspector 和 debug 操作入口仍存在。
- 窄验证命令：
  - `bunx vitest run server/rag/project-rag-visualization.test.ts app/components/novel-ide/rag/NovelRagPanel.contract.test.ts server/agent/tools/subject-memory-tools.test.ts server/agent/tools/sqlite-vec-smoke.test.ts --reporter=dot`
  - 如新增独立 inspector contract test，则一并运行。

## Verification / Test

- `bunx vitest run server/rag/project-rag-visualization.test.ts --reporter=dot` 通过：1 个测试文件，13 个测试通过。覆盖无 subjects 空概览、Project overview/detail、events CRUD/reorder、memory CRUD、坏 JSONL 禁止覆盖、CRUD 不创建不存在 subject、rebuild 未配置 embedding 时返回 subject 级错误、真实 RAG 搜索链路与 dirty 消费、Inspector chunk 级 embedding 元数据 / 向量预览、旧版 chunk schema 只读兼容、Inspector debug 操作、删除 subject index 失败不伪装成功、SQLite 读取失败时返回 `readError` 和可展示空状态。
- `bunx vitest run app/components/novel-ide/rag/NovelRagPanel.contract.test.ts --reporter=dot` 通过：1 个测试文件，4 个测试通过。覆盖 RAG tab 注册、user-assets 模式隐藏、基础空状态文案、真实 RAG API endpoint 绑定、不出现“打开源文件 / Embedding 设置”入口、加载失败清空旧数据、重建跳过时展示失败原因、Header RAG Inspector 入口、Workbench dialog shell、拆分组件、inspector/debug API 绑定和右侧 vector/debug 能力。
- `bunx vitest run server/rag/project-rag-visualization.test.ts app/components/novel-ide/rag/NovelRagPanel.contract.test.ts server/agent/tools/subject-memory-tools.test.ts server/agent/tools/sqlite-vec-smoke.test.ts --reporter=dot` 通过：4 个测试文件，33 个测试通过。
- `bunx vitest run server/rag/project-rag-visualization.test.ts server/agent/tools/subject-memory-tools.test.ts server/agent/tools/sqlite-vec-smoke.test.ts --reporter=dot` 通过：3 个测试文件，28 个测试通过。确认 Project RAG visualization、底层 subject memory tools 与 sqlite-vec smoke 仍可用。
- `bunx tsc --noEmit --pretty false` 仍失败在既有无关类型红灯：`agent-suggestion.test.ts`、`server/agent/harness/compaction.ts`、`server/agent/profiles/catalog.ts`、`server/agent/skills/silly-tavern-card-cli.test.ts`。本次输出未出现 Task 44 新增的 RAG DTO / service / API / panel 类型错误。
- `bunx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "project-rag|NovelRag|rag-inspector|RagInspector|project-rag-visualization"` 未输出 Task 44 相关类型错误。
- `bun run typecheck 2>&1 | Select-String -Pattern "project-rag|NovelRag|rag-inspector|RagInspector|project-rag-visualization"` 未输出 Task 44 相关 Vue 类型错误。

## Implementation Walkthrough

- 2026-06-08：用户提出新增简单版 RAG 可视化入口。确认第一版不是数据库可视化，范围是 Project 级，目标是让用户在产品中看到当前项目里存的 RAG 数据，并拥有一个明确的 RAG 显示入口。本 task 独立于 `43-subject-rag-memory`，后者继续作为底层 subject RAG / memory 合同和工程落地记录。
- 2026-06-08：继续阅读当前代码后更新落地方案。确认现有 RAG 搜索函数是 subject-scoped，Project 级可视化第一版应理解为“当前 Project 下所有 subject 的 RAG 数据入口”，而不是全 Project 向量搜索。前端落点确定为 IDE 左侧新增 `rag` tab 和 `NovelRagPanel.vue`；后端建议新增 `shared/dto/project-rag.dto.ts`、`server/rag/project-rag-visualization.ts` 与 `/api/projects/rag/**` 展示 / 搜索接口。
- 2026-06-08：用户确认入口命名使用 `RAG`，第一版不做 Project Search；需要提供重建索引操作和基础 CRUD；不需要 Search 失败时跳转 Embedding 设置，也不需要“打开源文件”入口。任务边界更新为“Project 级 RAG 可视化 + 轻量事实源管理”，CRUD 只操作 `events.jsonl` / `memory.jsonl`，不直接编辑 SQLite 缓存。
- 2026-06-08：用户确认剩余产品边界：events 允许重排；坏 JSONL 只报错不在 RAG 面板 raw repair；不创建 / 删除 subject；CRUD 后只标 dirty 不自动重建；重建索引提供当前 subject 和当前 Project 两个范围；memory 按旧 topic 定位；删除需要确认；页面显示轻量索引状态。
- 2026-06-08：已实现第一版 RAG 可视化。新增 `shared/dto/project-rag.dto.ts`、`server/rag/project-rag-visualization.ts`、`server/api/projects/rag/**`、`app/components/novel-ide/rag/NovelRagPanel.vue`；IDE 左侧新增 `RAG` tab，user-assets 模式隐藏。面板支持 Project subject 列表、events/memory 展示、真实 subject-scoped RAG 搜索、当前 subject / 当前 Project 重建索引、events CRUD + 上下重排、memory CRUD、删除确认、坏 JSONL 源级禁用编辑、轻量 index 状态展示。OpenAPI route map 已登记 `/api/projects/rag/**` 新接口。
- 2026-06-08：补充状态判断：若用户绕过 RAG 面板直接修改 `events.jsonl` / `memory.jsonl`，RAG 面板会通过 source hash mismatch 显示“有修改待索引”，避免旧 SQLite source 记录被误显示成已同步。
- 2026-06-08：补齐 API 边界 response DTO 校验。`/api/projects/rag/**` 路由现在对 service 返回值调用对应 `ProjectRag*DtoSchema.parse()`，确保 route 层 request body 与 response body 都落在 `shared/dto/project-rag.dto.ts` 合同内。
- 2026-06-08：修复 scoped review 发现的 RAG 面板状态问题。overview / subject 加载失败时会清空旧 overview、选中 subject、subject detail 和 search result，避免项目或 subject 切换失败后继续显示上一份 RAG 数据；重建索引返回 skipped subjects 时会展示每个失败 subject 的具体 message 摘要，而不是只显示跳过数量。
- 2026-06-08：新增第二阶段 UI 优化方案。现有左侧 RAG 侧边栏保留；Header 右上角新增独立 RAG Inspector dialog 入口。Inspector 重新单独设计，默认查看当前 Project / 当前 subject，展示 embedding 配置、索引 meta、向量维数、chunk 元数据和向量前 8 维预览，并提供完整 debug 操作：标记 dirty、删除 subject index、清空缓存、清空并重建。Inspector 不返回 API key，不展示完整 raw embedding，不直接编辑 SQLite 行或 JSONL 事实源。
- 2026-06-08：用户确认 RAG Inspector 第二阶段关键决策：chunk / entry 级 embedding provider、model、dimensions、indexedAt 必须真实落库；破坏性操作使用普通二次确认；base URL 显示脱敏 host / origin；chunk 列表支持 source 筛选与 `100 / 200 / 500` limit；`clear-index-cache` 与 `clear-index-cache-and-rebuild` 都保留；左侧 RAG 面板偏浏览，Inspector dialog 是重量级操作界面。
- 2026-06-08：已实现第二阶段 RAG Inspector。`subject_rag_chunks` 升级为 `subject-rag-v3` 并落库 `embedding_provider`、`embedding_model`、`embedding_dimensions`、`embedding_indexed_at`；新增 `ProjectRagInspector*` / `ProjectRagDebug*` DTO、`/api/projects/rag/inspector`、`/api/projects/rag/debug`、OpenAPI route map 登记、`readProjectRagInspector()` 与 `debugProjectRag()` service。Header 右上角新增 RAG Inspector 入口，`index.vue` 挂载 `NovelRagInspectorDialog.vue`。Dialog 支持 Status / Chunks / Search / Debug，展示脱敏 base URL、schema/meta、chunk 级 embedding 元数据、向量前 8 维预览，支持 source 筛选、`100 / 200 / 500` limit、mark dirty、delete subject index、clear cache、clear and rebuild。
- 2026-06-08：修复 scoped review 发现的 RAG Inspector 问题。`project-rag-visualization.test.ts` 改为在临时 cwd 内动态 import service，global embedding config 只写入测试 fixture，不再备份/覆盖真实仓库 `workspace/.nbook/config.json`；`delete-subject-index` 删除缓存时不再吞掉 SQLite 错误，数据库存在但删除失败会向 API 抛错，避免 UI 显示“已删除 0 条”这种假成功。
- 2026-06-08：用户要求 RAG Inspector UI 参考 `PlotWorkbenchDialog.vue` 重新写。确认方向为完整重构，可拆组件，允许前后端一起小改；布局采用左侧 subject 浏览、中间 chunk/search 列表、右侧详细 inspector，不完全死板照搬 Plot Workbench。第三阶段方案已写入 `12.1 RAG Inspector Workbench Rewrite`。
- 2026-06-08：已落地第三阶段 RAG Inspector Workbench 重写。`ProjectRagInspectorDto` 增加 `index.readError` 与 `selectedSubject.chunkSourceCounts`；service 在 SQLite 读取失败时返回可展示 readError，不拖垮 dialog。前端拆分为 `NovelRagInspectorSidebar.vue`、`NovelRagInspectorMain.vue`、`NovelRagInspectorDetail.vue` 和协调宿主 `NovelRagInspectorDialog.vue`；Dialog 使用 `size="workbench"` / `overlay-type="blur"`，实现左侧 subject 浏览、中间 Chunks/Search 主区、右侧 Project/Subject/Index/Embedding/Chunk/Search detail 与 debug 操作区。
- 2026-06-08：修复现场 UI “右侧有 chunks 统计但中间列表为空”的问题。根因是现有 Project 的 `.nbook/subject-rag.sqlite` 仍是旧版 `subject_rag_chunks` schema，缺少 `embedding_provider`、`embedding_model`、`embedding_dimensions`、`embedding_indexed_at`；Inspector 的 chunk list 查询把 chunk 正文和新 embedding 元数据放在同一条 SQL 里，列不存在后被 `safeReadInspectorChunkRows()` 吞掉，导致只剩 count 能展示。修复后 Inspector 会先探测 `subject_rag_chunks` 列集合，旧缓存也能展示 chunk 正文和向量预览；缺失的条目级 embedding 元数据在 UI 中显示为“旧索引未记录 / 需重建索引”。同时将 RAG Inspector UI 文案中文化，顶部状态、左侧 subject 状态、中间索引条目 / 召回测试、右侧检查器和索引操作均使用中文。

## TODO / Follow-ups

- 后续再决定是否做 Project Search / 跨 subject 搜索。
- 如需要产品级验收，再由用户确认后启动浏览器验证；本轮按项目规则未自动进行浏览器验证。
