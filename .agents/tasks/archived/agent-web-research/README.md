# Agent 联网研究

## 用户需求

- 给 NeuroBook 的 Agent 增加联网研究能力。
- 不把 `web_search` / `web_fetch` 直接给 `leader.default`。
- 新增一个专用 profile：`researcher`。
- `researcher` 创建出来的 agent 应具备连续对话能力，而不是一次性问答工具。
- 参考 Claude 的 `WebSearch` / `WebFetch` schema，但按 NeuroBook 当前 Pi-based harness 和小写工具命名约定设计。
- 进入技术选型阶段，优先评估 Brave Search 与 Tavily，并保留 Exa、Firecrawl、服务端自建 fetch、HTML 解析/清洗库作为后续 adapter / fallback 候选。
- 参考本地 Pi Brave Search Skill：`~/.pi/agent/git/github.com/badlogic/pi-skills/brave-search`。

## 目标

- 设计一套可审计、可持续对话、可替换 provider 的联网研究 profile 和工具合同。
- 让 Leader 通过 `get_agent_profile` / `create_agent` / `invoke_agent` 使用 `researcher`，而不是直接持有联网工具。
- 保持工具 schema 稳定，不把 provider-specific 参数泄漏给模型。
- 为后续实现固定第一版技术方向、配置边界、返回结构和风险控制。

## 完成标准

- 工具注册与权限：
  - 新增 `web_search` / `web_fetch` 两个 Agent 工具，并在默认工具注册表中注册。
  - `leader.default.allowedToolKeys` 不包含 `web_search` / `web_fetch`。
  - 新增 `researcher` profile，`allowedToolKeys` 只包含 `web_search`、`web_fetch`，不包含 `read`、`write`、`edit`、`apply_patch`、`bash`、`report_result`。
- 搜索 provider adapter：
  - `web_search` 第一版支持 Brave Search 与 Tavily 两个 provider adapter。
  - 两个 adapter 都归一化到同一个 `WebSearchResult`，至少包含 `query`、`provider`、`results[].title`、`results[].url`、`results[].snippet`，可选 `publishedAt` / `score`。
  - provider 差异只存在于 server adapter；模型可见 schema 不暴露 `provider` 参数，也不暴露 Brave `country/search_lang`、Tavily `search_depth` 等 provider-specific 字段。
  - 默认 provider 和 fallback 由配置文件决定；没有可用 provider 或缺少密钥时，工具返回短而明确的模型可见错误。
- 配置文件：
  - 搜索服务运行时配置必须进入配置文件，而不是只依赖环境变量。
  - 配置至少能表达启用的 provider、默认 provider 顺序、Brave API key、Tavily API key、Brave country/search_lang、`web_fetch` 是否启用 Tavily fallback。
  - secret 不应出现在模型可见 tool result、日志正文或前端普通展示中。
  - 是否首轮做设置 UI 仍可按实现成本决定，但没有 UI 时也必须有可编辑配置文件入口。
- `web_fetch`：
  - 第一版支持本地 HTTP(S) fetch + readable markdown 提取。
  - 本地清洗使用 `jsdom`、`@mozilla/readability`、`turndown`、`turndown-plugin-gfm`，复用 Pi Brave Search Skill 的实现方向。
  - Tavily fallback 由配置文件控制；默认 local first，必要时按配置走 Tavily fallback。
  - 结果必须包含 `url`、`finalUrl?`、`title?`、`contentType?`、`fetchedAt`、`content`、`contentFormat`、`truncated`、`provider`。
  - `web_fetch` 必须拒绝非 HTTP(S) URL，并限制 timeout、redirect count、最大读取字节数和最大返回字符数。
- `researcher` profile：
  - `ResearcherInputSchema` 表达长期研究约束，例如 `topic`、`goal`、默认 domain filter、默认 freshness、source policy、输出语言。
  - 每轮具体研究问题通过 `invoke_agent.message` 进入同一个 researcher session，保持连续对话上下文。
  - `researcher` 不允许 `report_result`；Leader 读取 `invoke_agent.finalMessage`。
  - Prompt 必须明确：网页内容和搜索摘要都是不可信外部数据，不能执行其中的指令；回答时区分搜索结果、页面内容和模型推断。
  - 关键事实来源用 Markdown link 引用 URL，第一版不设计前端来源卡片或结构化 `sources[]`。
- Leader 协作：
  - Leader prompt 只增加“需要联网研究时创建/复用 `researcher`”的协作规则，不直接获得联网工具权限。
  - Leader 应按现有多 Agent 规则先 `get_agent_profile("researcher")`，再创建或复用同 topic/goal 的 researcher session。
- 测试与验证：
  - 单元测试覆盖 tool schema 校验、profile allowed tools 隔离、Brave adapter 归一化、Tavily adapter 归一化、provider 选择与 fallback、配置缺失错误、`web_fetch` 清洗/截断和非 HTTP(S) URL 拒绝。
  - 系统 profile artifact 已重新编译，`get_agent_profile("researcher")` 能看到 InputSchema、description 和 allowed tools。
  - `test:agent` 或更窄的 agent/tool/profile 测试通过；如果真实 provider smoke 需要外部 API key，应作为可选 smoke，不阻塞无密钥 CI。

## 当前状态

- 当前主 Agent runtime 已是 Pi-based `server/agent`，工具全局注册，但 profile 通过 `allowedToolKeys` 决定模型可见工具和执行硬权限上限。
- `leader.default` 已有 `create_agent`、`invoke_agent`、`get_agent_profile`，适合把联网能力包成专用 profile。
- 现有 profile 命名使用小写 key，例如 `leader.default`、`retrieval`、`writer`；工具名使用小写或 snake_case，例如 `read`、`report_result`、`request_user_input`。
- Pi 源码里 `WebSearch` / `WebFetch` 主要是 Claude Code 兼容命名参考，不是可直接复用的 web search 实现。

## 执行记录

- 已确认不把 `web_search` / `web_fetch` 加入 `leader.default.allowedToolKeys`。
- 已确认新 profile 名称使用 `researcher`，不使用 `web.research`。
- 已确认 `researcher` 应是可长期复用的 linked agent；创建 input 表达长期研究约束，每轮具体问题通过 `invoke_agent.message` 继续对话。
- 已确认第一版 `web_fetch` 不在工具内部隐藏调用另一个 LLM。工具负责 fetch、解析、清洗、截断、返回正文与元数据；`researcher` 拿到正文后自行分析。
- 已确认删除 `web_fetch.prompt` 参数，避免误导模型认为工具会执行抽取/总结指令。
- 已进入技术选型阶段，候选包括：
  - Tavily：面向 LLM 的搜索服务，可返回搜索结果、domain filter、时间过滤，也可带清洗后的 raw content。
  - Brave Search API：独立搜索索引，适合纯搜索结果层；Pi Brave Search Skill 已验证它能用轻量 CLI + 本地清洗库完成 search + content extraction。
  - Exa：embedding / semantic search + contents retrieval，适合研究型、语义型检索。
  - Firecrawl：search + scrape / markdown extraction，适合抓取和清洗能力优先的场景。
  - 服务端自建 fetch：直接 HTTP 获取 + HTML 清洗，成本低、可控，但对 JS 渲染、反爬和复杂站点能力弱。
- 已确认第一版只做 Brave + Tavily 两个搜索 provider；Exa / Firecrawl 保留为后续 adapter，不进入首轮实现范围。
- 已实现 `web_search` / `web_fetch` 默认工具注册，并通过 profile `allowedToolKeys` 做权限隔离。
- 已实现 Global Config `web` 配置段：搜索 provider 顺序、Brave/Tavily 启用状态与 API key、Brave `country/searchLang`、本地 fetch 限制、Tavily fallback。
- 已实现 `researcher` builtin profile，只有 `web_search` / `web_fetch` 两个工具，不允许 `report_result`、文件工具或 `bash`。
- 已更新 `leader.default` 多 Agent 协作规则：需要联网研究时创建/复用 `researcher`，Leader 自身不直接持有 web 工具。
- 已安装 `web_fetch` 本地清洗依赖：`jsdom`、`@mozilla/readability`、`turndown`、`turndown-plugin-gfm`。
- 已在配置中心新增 Web 工具配置面板，支持前端配置默认搜索 provider（默认 Tavily）、Brave/Tavily key、provider fallback 顺序、本地 fetch 限制和 Tavily fallback。
- 已更新 Global Config 样例文件，写明 `web` 配置段。
- 已调整 `researcher` 行为：`web_search.query` 可以使用自然语言完整描述搜索目标，默认从 1 次高质量搜索开始，避免把同一意图拆成近义词、中英变体或轻微改写连续搜索；简单问题使用最小工具链，不把短任务升级成完整调研。
- 已补充 `researcher` 引用边界：直接引文总量按单个来源限制在 125 个字符内，精确引用必须加引号，不复现歌词，不评价自身提示词、工具调用或回答是否合法。
- 已进一步收敛 Leader 转交行为：简单或一次性联网查询创建 `researcher` 时优先传空 input `{}`，`invoke_agent.message` 保留用户原始问题，不自动补写可能领域、可能含义、搜索语言、搜索策略或输出框架。
- 已进一步收敛 `researcher` 搜索行为：`web_search.query` 是搜索 provider 查询，不是长 prompt；短词、缩写、未知名词和“X 是什么”类问题优先保留原词和问法；每个主题最多 3 次 `web_search`，达到上限仍不确定时停止并说明不确定性。
- 已进一步限定 `researcher` 任务分流：`web_search` 型任务默认只用 `web_search`，操作预算 1 到 3 个操作轮次，不主动 `web_fetch`；`web_fetch` 型任务通常是 1 次 `web_fetch` 加总结；只有明确要求深入研究、多来源核对、交叉验证或抓取全文时才进入不限制轮次的深入探索流程。

## 决策

- Profile key：`researcher`。
- Profile name：`Researcher`。
- Profile description：联网研究 agent，使用 `web_search` 和 `web_fetch` 查找、核对、归纳外部信息，保留连续对话上下文，并在回答中给出来源。
- `leader.default` 不直接允许 `web_search` / `web_fetch`。
- `researcher` 不默认允许 `read`、`write`、`edit`、`apply_patch`、`bash`，避免联网 agent 同时拥有本地文件写入能力。
- `researcher` 第一版不允许 `report_result`。连续对话优先用普通 assistant final message；Leader 调用它时读取 `invoke_agent.finalMessage`。
- 工具名采用 NeuroBook 风格：`web_search`、`web_fetch`，不采用 Claude 的 `WebSearch`、`WebFetch` casing。
- Web 工具返回必须把外部内容视为不可信输入；profile prompt 需要要求模型区分搜索结果事实、页面正文和模型推断。
- Web 工具内部应做 provider adapter 兼容层。模型只看到稳定 `web_search` / `web_fetch` schema；Brave、Tavily 等搜索聚合服务差异由 server adapter 处理。
- 搜索服务必须在配置文件中配置；`web_search` 默认 provider 顺序、`web_fetch` fallback、Brave country/search_lang 等都走配置，不进模型可见 schema。
- `researcher` 不允许 `report_result`，保留连续对话 agent 心智。
- `web_search` 不暴露模型可见 `provider` 参数，由服务端按配置选择。
- `researcher` 的默认查询策略是“少而全”：优先一次自然语言搜索查全；只有首轮结果不足、冲突、过旧、质量差，或需要核对特定来源/版本/时间点时才追加搜索。
- `researcher` 的默认执行策略是“够用即停”：简单问题短答，必要时只抓取少量高价值页面，不主动扩大研究范围。
- `web_search` 型任务默认不主动使用 `web_fetch`。搜索结果摘要足够回答时直接回答；不足时最多补到 3 次搜索。
- `web_fetch` 型任务默认只对指定 URL 调用一次 `web_fetch` 并总结，不再额外搜索，除非 URL 抓取失败或用户明确要求核对外部来源。
- 深入探索流程必须由用户或调用方明确要求，例如深入研究、详细调研、多来源核对、交叉验证、比较多个来源、逐页阅读或抓取全文。
- `invoke_agent.message` 是目标 agent 任务输入字段。Leader 新调用 researcher 时应保留用户原始问题，最多做一句最小改写，不写成长委托 prompt。
- 简单 researcher 创建优先使用空 input `{}`；只有用户明确给出长期研究主题、固定来源范围、默认时间范围、输出语言或 source policy 时才填写 `create_agent.input`。
- 第一版来源格式使用普通 Markdown link，不提前设计前端来源卡片或结构化 `sources[]`。

## 已确认决策

- 搜索服务运行在配置文件中配置，而不是只依赖环境变量。
- `web_fetch` fallback 也由配置控制。
- `researcher` 第一版不允许 `report_result`。
- `web_search` 不暴露模型可见 `provider` 参数。
- Brave `country` / `search_lang` 第一版只作为配置项，不进入 tool schema。
- 来源引用第一版使用普通 Markdown link，不设计前端 sources 卡片。

## Schema 草案

### `web_search`

```ts
export const WebSearchSchema = Type.Object({
    query: Type.String({
        minLength: 2,
        maxLength: 500,
        description: "Search query. Write a focused natural-language query, not a full task brief.",
    }),
    allowed_domains: Type.Optional(Type.Array(Type.String({
        minLength: 1,
        description: "Domain only, for example wikipedia.org or openai.com. Do not include scheme or path.",
    }), {
        maxItems: 20,
        description: "Only include results from these domains.",
    })),
    blocked_domains: Type.Optional(Type.Array(Type.String({
        minLength: 1,
        description: "Domain only, for example pinterest.com. Do not include scheme or path.",
    }), {
        maxItems: 50,
        description: "Never include results from these domains.",
    })),
    recency_days: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 3650,
        description: "Prefer results published or updated within this many days. Omit when freshness is not required.",
    })),
    max_results: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 10,
        description: "Maximum number of search results to return. Default 5, hard max 10.",
    })),
});
```

归一化返回结构：

```ts
type WebSearchResult = {
    query: string;
    provider: "tavily" | "exa" | "firecrawl" | "brave" | "local";
    results: Array<{
        title: string;
        url: string;
        snippet: string;
        source?: string;
        publishedAt?: string;
        score?: number;
    }>;
};
```

### `web_fetch`

```ts
export const WebFetchSchema = Type.Object({
    url: Type.String({
        format: "uri",
        description: "The HTTP or HTTPS URL to fetch content from.",
    }),
});
```

归一化返回结构：

```ts
type WebFetchResult = {
    url: string;
    finalUrl?: string;
    title?: string;
    description?: string;
    contentType?: string;
    fetchedAt: string;
    content: string;
    contentFormat: "markdown" | "text";
    truncated: boolean;
    provider: "local" | "tavily" | "exa" | "firecrawl";
};
```

### `researcher` InputSchema

```ts
export const ResearcherInputSchema = Type.Object({
    topic: Type.Optional(Type.String({
        maxLength: 500,
        description: "Long-lived research topic for this researcher session. Omit for a general researcher.",
    })),
    goal: Type.Optional(Type.String({
        maxLength: 1200,
        description: "Stable research goal or operating brief for this researcher session. Per-turn questions should be sent via invoke_agent.message, not stored here.",
    })),
    allowed_domains: Type.Optional(Type.Array(Type.String({
        minLength: 1,
        description: "Default allowed domain filter inherited by web_search unless the turn asks otherwise.",
    }), {maxItems: 20})),
    blocked_domains: Type.Optional(Type.Array(Type.String({
        minLength: 1,
        description: "Default blocked domain filter inherited by web_search unless the turn asks otherwise.",
    }), {maxItems: 50})),
    default_recency_days: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 3650,
        description: "Default freshness preference for web_search. Omit for no default recency filter.",
    })),
    source_policy: Type.Optional(Type.Union([
        Type.Literal("balanced"),
        Type.Literal("primary_sources"),
        Type.Literal("recent_first"),
    ], {
        description: "Default source preference. primary_sources means prefer official docs, papers, laws, specs, or original announcements when available.",
    })),
    output_language: Type.Optional(Type.String({
        description: "Preferred response language, for example zh-CN or en. Default follows the caller/user language.",
    })),
});
```

## 技术选型

### `web_search` 候选方案

| 方案 | 优点 | 缺点 | 适配判断 |
| --- | --- | --- | --- |
| Brave Search API | 独立搜索索引；支持 freshness、country/language targeting、extra snippets、搜索操作符和分页；Pi Brave Search Skill 已提供可参考的轻量实现。 | 主要提供搜索结果层；NeuroBook 仍要自己 fetch 和 clean 页面。 | 第一版必须支持，适合作为可控的低层搜索后端。 |
| Tavily | Search API 明确面向 LLM 场景；支持 include/exclude domain 过滤、时间过滤、结果摘要，也可选返回清洗后的 raw content。 | 外部付费 provider；advanced / auto 参数可能增加成本；provider-specific 参数应藏在 adapter 后面。 | 第一版必须支持，适合作为 agent-facing search 的高层 provider。 |
| Exa | 语义检索和研究型召回较强；`/search` 可在 `contents` 下请求正文内容；`/contents` 可按已知 URL 取内容。 | API 在 content 嵌套、category 限制等方面更容易踩坑；简单关键词搜索未必最直观。 | 适合作为语义研究、学术资料和 source discovery 的第二 adapter。 |
| Firecrawl | Search endpoint 可把 SERP 与 scrape / markdown content 结合；抓取和清洗链路强。 | 如果每次搜索都用它，延迟和成本可能更高；更适合作为 fetch/scrape fallback，而不是默认 search。 | 当完整页面 markdown 比纯搜索结果更重要时适合接入。 |
| 通过公共搜索页面做本地搜索 | 如果存在稳定允许的 endpoint，会便宜且简单。 | 抓取搜索结果页很脆弱，也容易触碰服务政策边界。 | 不推荐作为第一版实现。 |

初步建议：

- 第一版 `web_search` 同时支持 Brave adapter 和 Tavily adapter。
- adapter 层统一输出 `WebSearchResult`，并把 provider-specific 参数映射藏在服务端；模型不直接知道当前 provider 的完整 API。
- 默认 provider 可以先由服务端配置决定：有 `TAVILY_API_KEY` 时优先 Tavily；否则有 `BRAVE_SEARCH_API_KEY` 时使用 Brave；如果两者都缺失，工具返回明确配置错误。
- 保留 provider interface，让 Exa / Firecrawl 后续能在不改变工具 schema 的情况下接入。
- 第一版不要把 Tavily `search_depth`、Exa `type`、Firecrawl `scrapeOptions`、Brave `country/search_lang` 直接暴露到模型可见 schema。

### Pi Brave Search Skill 参考

本地 Pi skill 路径：`~/.pi/agent/git/github.com/badlogic/pi-skills/brave-search`。

- `SKILL.md` 把 Brave Search 暴露成技能说明，而不是 provider-native 模型能力。
- `search.js` 调用 `https://api.search.brave.com/res/v1/web/search`，使用 `BRAVE_API_KEY`，支持：
  - `-n <num>`：默认 5，最大 20。
  - `--content`：对结果页逐个抓取并转 markdown。
  - `--country <code>`：默认 US。
  - `--freshness <period>`：`pd` / `pw` / `pm` / `py` 或日期范围。
- `content.js` 只做 URL 抓取和 readable markdown 提取。
- 内容提取依赖：`jsdom`、`@mozilla/readability`、`turndown`、`turndown-plugin-gfm`。
- 对 NeuroBook 的启发：
  - 不照搬 CLI 交互，但复用“search adapter + content extraction adapter”的分层。
  - `web_search` 不默认带全文内容；需要全文时让 `researcher` 对高价值 URL 再调用 `web_fetch`。
  - Brave freshness 可由 `recency_days` 映射为 `pd` / `pw` / `pm` / `py`，更精确日期范围后续再加。
  - Brave `country`、`search_lang` 第一版先作为 server config，不进入模型可见 schema。

### `web_fetch` 候选方案

| 方案 | 优点 | 缺点 | 适配判断 |
| --- | --- | --- | --- |
| Local direct fetch + Readability / Turndown | 成本低、可检查、不依赖额外 provider，对 docs / article / blog 这类静态页面效果好。 | 对 JS 渲染、bot-protected、PDF-heavy 或 paywalled 页面较弱。 | 最适合作为第一版本地路径。 |
| Exa Contents | 可返回接近 markdown 的主内容，并过滤页面外围 chrome；适合已知 URL。 | 依赖外部 provider 且有成本；普通静态页面未必需要。 | 适合作为 local fetch 清洗失败时的 fallback。 |
| Tavily Extract / include raw content | 如果已经配置 Tavily，使用方便；可从搜索结果页返回 markdown/text raw content。 | 会把 search 和 fetch 行为耦合到 Tavily。 | 如果第一版 search 选 Tavily，适合作为 fetch fallback。 |
| Firecrawl Scrape | 页面转 markdown 能力强，偏动态抓取。 | 比 local direct fetch 更重。 | 适合难抓页面或未来 crawl workflow。 |
| Browser automation | 能处理 JS 页面和视觉状态。 | 昂贵、慢、运维复杂度高。 | 不作为第一版；保留给未来显式 browser-capable fetch。 |

初步建议：

- 第一版 `web_fetch` 使用 local `fetch()` + HTML cleaning。
- fallback 路径做成可配置 provider fetch：第一版只考虑 Tavily fallback；Exa / Firecrawl 保留为后续扩展。
- `web_fetch` 工具结果必须控制 token budget，并始终返回 `truncated: true/false`。

### HTML 解析和清洗候选库

| 库 | 用途 | 说明 |
| --- | --- | --- |
| `@mozilla/readability` | 主文章提取 | Firefox Reader View 的独立提取库；需要 DOM 输入；处理不可信 HTML 时输出仍应做清洗。 |
| `cheerio` | 预清洗和 metadata 提取 | 快速 HTML/XML parser，提供类 jQuery API；适合移除 scripts/nav/forms，读取 meta tags。 |
| `turndown` | HTML 转 Markdown | 成熟的 HTML-to-Markdown 转换库；适合在 Readability 返回 HTML content 后转 markdown。 |
| `html-to-text` | HTML 转纯文本 | 如果第一版更偏向纯文本，或 markdown 噪音太多，可以使用。 |
| `jsdom` / `linkedom` | Readability 的 DOM 宿主 | `jsdom` 更成熟但较重；`linkedom` 可能更轻，但需要验证和 Readability 的兼容性。 |

初步建议：

- 起步使用 `jsdom` + `@mozilla/readability` + `turndown` + `turndown-plugin-gfm`，与 Pi Brave Search Skill 保持一致。
- 必要时用 `cheerio` 在 Readability 前做 metadata 提取和粗清洗。
- 只有 markdown 质量明显噪音过大时，再考虑 `html-to-text`。
- 进入实现阶段后再用 `bun add` 安装依赖。

## Provider Adapter 形状

```ts
type WebSearchProvider = {
    key: string;
    kind: "search";
    search(input: {
        query: string;
        allowedDomains?: string[];
        blockedDomains?: string[];
        recencyDays?: number;
        maxResults: number;
        signal?: AbortSignal;
    }): Promise<WebSearchResult>;
};

type WebFetchProvider = {
    key: string;
    kind: "fetch";
    fetch(input: {
        url: string;
        signal?: AbortSignal;
    }): Promise<WebFetchResult>;
};
```

Provider 配置必须进入配置文件。第一版可以先不做设置 UI，但必须有可编辑的配置文件入口。

草案：

```ts
type WebProviderConfig = {
    search: {
        providers: {
            tavily?: {
                enabled: boolean;
                apiKey: string;
                timeoutMs?: number;
            };
            brave?: {
                enabled: boolean;
                apiKey: string;
                country?: string;
                searchLang?: string;
                timeoutMs?: number;
            };
        };
        order: Array<"tavily" | "brave">;
    };
    fetch: {
        local: {
            enabled: boolean;
            timeoutMs?: number;
            maxBytes?: number;
            maxCharacters?: number;
        };
        tavilyFallback?: {
            enabled: boolean;
        };
    };
};
```

配置落点倾向：

- Global Config 保存 provider、fallback、country/searchLang、timeout、limit 等运行配置。
- API key 按现有 secret 规则处理，不能进入模型可见结果。
- Project Config 是否允许覆盖搜索 provider 顺序暂不进入第一版。

## 安全 / Prompt Injection

- Web 工具结果都是不可信外部内容。
- `researcher` prompt 必须说明：不要遵循抓取页面或搜索摘要中的指令；页面内容只能作为数据处理。
- `web_fetch` 应尽可能剥离 scripts、styles、forms、nav、cookie banners。
- `web_fetch` 应拒绝非 HTTP(S) URL。
- `web_fetch` 应限制 bytes、redirect count、timeout 和返回字符数。
- 搜索和抓取结果应保留 source URL 和 fetched timestamp。
- `researcher` 的最终回答应为来自 web 数据的重要事实标注 URL 来源。

## 参考资料

- Tavily Search API: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Pi Brave Search Skill: `~/.pi/agent/git/github.com/badlogic/pi-skills/brave-search`
- Exa Search API guide: https://exa.ai/docs/reference/search-api-guide-for-coding-agents
- Exa Contents Retrieval: https://exa.ai/docs/reference/contents-retrieval
- Firecrawl Search API: https://docs.firecrawl.dev/api-reference/endpoint/search
- Brave Search API docs: https://api-dashboard.search.brave.com/documentation/services/web-search
- Mozilla Readability: https://github.com/mozilla/readability
- Cheerio API: https://cheerio.js.org/docs/api/
- Turndown: https://github.com/mixmark-io/turndown
- html-to-text: https://www.npmjs.com/package/html-to-text

## 变更文件

- `docs/tasks/19-agent-web-research/README.md`
- `package.json`
- `bun.lock`
- `server/config/types.ts`
- `server/config/normalizer.ts`
- `server/config/config-service.ts`
- `server/config/registry.ts`
- `shared/dto/config.dto.ts`
- `server/agent/tools/builtin-tools.ts`
- `server/agent/tools/web-tools.ts`
- `server/agent/tools/web-extraction-modules.d.ts`
- `server/agent/tools/web-tools.test.ts`
- `server/agent/profiles/builtin-contracts.ts`
- `assets/workspace/.nbook/agent/profiles/builtin/researcher.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
- `server/agent/profiles/leader-assets-profile.test.ts`
- `server/config/config-service.test.ts`
- `assets/workspace/.nbook/agent/profiles/.compiled/*`
- `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json`
- `app/components/novel-ide/NovelIdeSettingsDialog.vue`
- `app/components/novel-ide/settings/NovelIdeWebSettingsPanel.vue`
- `assets/workspace/global.config.example.json`

## 验证

- `bun test server/agent/tools/web-tools.test.ts server/config/config-service.test.ts server/agent/profiles/leader-assets-profile.test.ts` 通过：26 tests passed。
- `bun test server/config/config-service.test.ts server/agent/tools/web-tools.test.ts` 通过：17 tests passed，覆盖 Web 配置写回保留模型配置段。
- 删除 `web_fetch.prompt` 后，`bun test server/agent/tools/web-tools.test.ts` 通过：6 tests passed。
- 删除 `web_fetch.prompt` 后，`bun test server/config/config-service.test.ts server/agent/profiles/leader-assets-profile.test.ts` 通过：21 tests passed。
- 删除 `web_fetch.prompt` 后，`bun scripts/prepare-system-profile-metadata.ts` 通过：刷新 6 个系统 profile artifact 和 profile variable IDE types。
- 调整 `researcher` 查询行为后，`bun scripts/prepare-system-profile-metadata.ts` 通过：刷新 6 个系统 profile artifact 和 profile variable IDE types。
- 调整 `researcher` 查询行为后，`bun test server/agent/profiles/leader-assets-profile.test.ts` 通过：10 tests passed。
- 限定 `researcher` 任务分流后，`bun scripts/prepare-system-profile-metadata.ts` 通过：刷新 6 个系统 profile artifact 和 profile variable IDE types。
- 限定 `researcher` 任务分流后，`bun test server/agent/profiles/leader-assets-profile.test.ts` 通过：10 tests passed。
- `node -e "JSON.parse(require('fs').readFileSync('assets/workspace/global.config.example.json','utf8')); console.log('json ok')"` 通过。
- `bun scripts/profile.ts status --all --system` 通过：`leader.assets`、`leader.default`、`researcher`、`retrieval`、`summarizer`、`writer` 均为 `loaded`。
- `bun run typecheck` 仍因既有无关文件 `server/agent/skills/silly-tavern-card-cli.test.ts` 的 TS18048 可选字段错误失败。当前 Web 配置面板相关类型错误已清除。
- `bun run build` 已执行到 `prepare-system-profile-metadata`，成功刷新 6 个系统 profile artifact；随后 `tsc` 因同一个 `server/agent/skills/silly-tavern-card-cli.test.ts` TS18048 错误失败。当前 web 相关类型错误已清除。

## TODO / 后续事项

- 可选：加入真实 provider smoke test，使用本地 API key 时才运行，不阻塞无密钥 CI。
- 可选：后续接 Exa / Firecrawl adapter，保持模型可见 schema 不变。
