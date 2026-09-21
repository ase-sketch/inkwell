# 小说理解 Brief 与图谱 Spike 恢复卡

生成时间：2026-08-26

## 当前基线

- Current Task：`w00005-novel-understanding-spike/tasks/t01-novel-understanding-spike`；legacy 来源为 `00161-novel-understanding-spike`。
- 当前工作目录为主工作区；开发者明确要求不创建分支或 worktree。
- 研究入口是 `evidences/novel-qa-service.md`；该研究 Task 不写 `packages/` 文档。
- 样书由用户管理，路径为 `.local/novels/转生反派萝莉，找茬魔法少女.epub`。**2026-08-29 起按根 `AGENTS.md`「真实模型调用与样本数据」**：小说、章节正文、小说相关提示词、摘要和研究产物不属于敏感数据，可按 Task 的`允许文件`进入 Git（第一章见 `evidences/chapter-001-source-normalized.txt`）；密钥、个人数据与商业秘密仍不进。样书本体保持只读，进库的是归一化正文，来源与归一化版本按 Task 登记。
- 当前 `nb-memory.ingestRaw` 接受调用方文本并同步执行分块、LLM 事实抽取、LLM 主体/状态消解；`search` 只返回 `SearchHit[]`。
- World Engine 是动态世界状态与时间线真相源；Plot System 是作者视角的剧情结构系统，Scene 是连接 World Engine 的桥梁。

## 开发者决策

- 范围扩大到 NeuroBook 拆书和剧情理解，以及理解产物如何被 `nb-memory`、World Engine 和 PlotBench 消费。
- 系统采用渐加处理：用户可选择全部处理或懒惰加载；全部处理覆盖当前全部来源单元，懒惰加载处理到满足当前需要，连载新增内容继续增量处理。
- `nb-memory` 可以扩展，不再预设所有小说理解能力永久属于宿主层。
- 第一章实验使用两次独立的 DeepSeek V4 Flash 调用：第一次生成 brief，第二次只接收 brief 并 ingest 成候选图。
- 交付一个可直接查看的 HTML，区分 `nb-memory` 原生图与 World Engine / PlotBench 建议投影。
- 旧 `chapter-001-brief.json` 被开发者重新定性为 evidence 型结构包；本轮的 brief 指去除文笔、专注剧情的可读摘要文字。
- 本轮对同一第一章生成三级摘要：一级接近原文缩句，可保留原对话和叙事手法；二级保留少量关键对话与详细剧情；三级只保留极关键对话和关键剧情，用几句话概括。
- 三个等级必须使用同一 `DeepSeek V4 Flash` 模型、同一章原文和相同事实约束，只改变摘要密度提示词，便于直接比较。
- 本轮来源规范固定为上一轮可复现的 `chapter-source-normalization/v1`：直接解压 `OEBPS/chapter_00001.xhtml`；移除 `script`/`style`；把 `br` 与 `p/div/h1-h6` 结束标签转为换行；去除其余标签；解码 HTML 实体；逐行 trim、删除空行并用单换行连接。该结果为 `textChars=2122`、SHA-256 `22c9b12d0305da4b64ea39751e809ed47cf9254d574caf875fbff91ef82552ee`。`2122` 是包含换行的字符串长度，不是去空白后的可见字数。
- 开发者否决现有 L1 的质量：它按时间顺序重排了原文开场倒叙，未充分保留原对话和原叙事过程。L1 的用途不是普通长摘要，而是作者交给写作模型的高保真写作指令；下游应能据此复原场景顺序、信息揭示、人物反应、关键对话和原文明示的心理活动。
- 所有摘要只能保留原文明示或可直接确定的内容。可以保留角色原文明示的心理描写、判断、误解和情绪，但必须归属于角色，不能把摘要者的主观推断写成事实；原文保持含混时摘要也保持含混。
- 开发者否决 `1488` 可见字的首份人工候选：L1 必须至少删去原文 `50%`，本章正文与批注合计少于 `1000` 可见字；不需要保留全部台词，关键台词保留原句，其余可以客观转述。
- “允许 L1 携带批注”仍是待审查设计候选。只有开发者明确提供的内容可标为“作者批注”；系统从原文提取的叙事顺序、信息揭示、节奏和角色声音要求只能标为“结构批注”，不得伪装成作者意图。批注与正文共同计入千字上限。
- L1 研究暂停。开发者将 L1 定义为面向用户、用于命令 writer 的语言；当前转向 L2。
- L2 的目标用途调整为实体抽取与 `nb-memory` ingest 的输入文字。审查重点不只是可读性，还包括持久实体/别名、角色与类型术语、物品、约定/承诺、状态变化、信息揭示、未决异常和候选伏笔的召回，以及说法来源与不确定性是否保留。
- 开发者指出官方 L2 几乎看不出苏天晴的性格：低辨识度的问名原话没有必要，台词应优先服务人物性格、独特声音或金句，同时仍可承担身份、契约和状态边界。当前工作决策是 L2 必须保留可复核的性格证据（动作、选择、心理、称呼和少量高价值原话），但不由单章摘要者直接固化“可爱俏皮”等稳定性格标签；跨章人物聚合层再形成带证据的性格判断。
- 官方 L2 还在初次照镜段提前写入“穿着宽松睡裙”；原文直到“两分钟前”开场白之后再次照镜才揭示该衣物。这与提前薅尾巴同属信息揭示顺序缺陷。普通衣物可以删除，但一旦保留就不能提前泄露。
- 开发者指出 v3 把“苏天晴恍惚看见太奶”压成太奶客观在场，导致感知与事实边界丢失；同时采纳审查补充：v3 的“证实触感真实”把苏天晴的主观感叹升级为摘要者确认。v4 必须保留感知主体、恍惚/主观语气及真实性未知，不能把角色感受变成外部事实。
- 开发者认为L2 v4正文结果可以，但指出v4提示词固定第一章人物、台词、未知项和7节点，不具备可接受泛化性；要求提示词通用后执行v5供审查。v5 system prompt不得出现样章专名、样章节点、样章答案或样章未知项，作品名、章节、字数区间和正文只作user参数。本轮继续以第一章做回归，不能据此宣称跨作品泛化已经实证。
- 开发者完成v4/v5最终审查：v5因把昏暗房间开场后的倒叙改成时间正序而否决；v4是当前候选中最好的正文。正式裁决为：v4正文accepted，但只作为第一章当前最佳可读L2成品和后续质量基准；v4提示词rejected for general use；v5正文rejected；v5通用提示词方向evidence-insufficient。v4的`1150`字超限、局部主语/顺序/漏项和非唯一ingest边界继续保留。
- 开发者随后明确要求“抛出v6来我再审查”。本轮v6必须保持提示词通用，不回退到v4专章7节点；输入正文增加通用段落编号，输出保留连续来源区间锚点，外部验证全段覆盖无缺号、倒序、重叠或越界，并由人工核对每个区间语义，直接针对v5把昏暗房间开场后的倒叙改为时间正序的问题。本轮不做额外跨模型审查，只生成唯一v6候选供开发者判断。
- 开发者在恢复检查确认首次v6候选不可恢复后，明确授权恰好一次`chapter-001-summary-level-2-ingest-v6-official-retry`。retry完全复用冻结prompt、`P001–P077`编号正文、DeepSeek V4 Flash和调用参数；唯一非空候选必须先原样保存，锚点与长度校验只记录、不拒绝。本轮仍不做额外跨模型审查。
- 开发者审查v6后明确要求“参考我们之前的讨论后决策，然后做V7”。据此v7不再把`[P001-P008]`等审计锚混入可读正文；输出改为无段号可读摘要和独立脱敏证据JSON。v4继续作为第一章质量基准。

## 受限动作授权

开发者在当前对话明确授权对样书第一章执行真实 DeepSeek V4 Flash 调用：上一轮两次 brief/graph 调用、本轮三个摘要密度对照调用、L1 首次失败后的第一次补调用，以及在前两次 L1 均为 `client-failure` 且没有可见文本后以“继续尝试 L1”授权的恰好一次第三次 L1 尝试。第三次尝试必须复用同一模型、正文、L1 固定提示词和参数；不授权第四次尝试、smoke、质量复核、其它模型、其它书籍、产品写入或其它调用目的。

开发者随后明确要求“修正后重新生成 L2、L3”。本轮据此新增恰好两个真实调用目的：`chapter-001-summary-level-2-ingest-v2` 与 `chapter-001-summary-level-3-v2`，均使用 `opencode/deepseek-v4-flash`、同一 `chapter-source-normalization/v1` 正文、独立新上下文和 `maxTokens=4000`。不授权 smoke、补跑、额外质量复核调用、L1 调用、其它模型或其它章节。

L2 v2 首次调用以 `client-failure` 失败且没有可见文本后，开发者额外授权恰好一次 `chapter-001-summary-level-2-ingest-v2-retry`。该调用必须复用已固定提示词、同一模型、同一正文和 `maxTokens=4000`；不授权第二次重试、L3 重跑、smoke、额外质量复核调用、其它模型或其它章节。

开发者随后指定使用其本机 NeuroBook 配置中的 DeepSeek 官方 API。脱敏配置确认 provider `deepseek`、model `deepseek-v4-flash`、host `api.deepseek.com`。本轮授权恰好一次 `chapter-001-summary-level-2-ingest-v2-official` 调用，复用固定 L2 v2 提示词、同一正文和 `maxTokens=4000`；不授权重试、L3 重跑、smoke、额外质量复核调用或其它模型/章节。

开发者随后明确要求“把新的 L2 跑出来给我审查”。本轮新增恰好一次真实调用 purpose：`chapter-001-summary-level-2-ingest-v3-official`。调用使用 DeepSeek 官方 provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、同一 `chapter-source-normalization/v1` 第一章正文、冻结的完整 `chapter-summary-level-2-ingest/v3` 提示词、独立新上下文和 `maxTokens=4000`。不授权自动重试、L3 重跑、其它模型/章节、smoke、模型质量复核或第二份候选；成功或失败均耗尽本次授权。

开发者随后明确要求“再次审查优化，跑 v4”。本轮新增恰好一次真实调用 purpose：`chapter-001-summary-level-2-ingest-v4-official`。调用使用 DeepSeek 官方 provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、同一 `chapter-source-normalization/v1` 第一章正文、冻结的完整 `chapter-summary-level-2-ingest/v4` 提示词、独立新上下文、官方直连 `thinking.type=disabled` 和 `max_tokens=4000`。不授权自动重试、第二份 v4、L1/L3 重跑、其它模型/章节、smoke 或模型质量复核；成功或失败均耗尽本次授权。响应必须严格满足 `choices.length === 1` 且 `choices[0].message.content` 为非空字符串，否则调用失败且不保存任何响应正文。

开发者随后明确要求“提示词要通用，然后跑V5给我审查”。本轮新增恰好一次真实调用purpose：`chapter-001-summary-level-2-ingest-v5-official`。调用使用DeepSeek官方provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、同一`chapter-source-normalization/v1`第一章正文、冻结的完整`chapter-summary-level-2-ingest/v5`通用提示词、独立新上下文、官方直连`thinking.type=disabled`和`max_tokens=4000`。不授权自动重试、第二份v5、L1/L3重跑、其它模型/章节、smoke或模型质量复核；成功或失败均耗尽本次授权。响应必须严格满足`choices.length === 1`且`choices[0].message.content`为非空字符串，否则调用失败且不保存任何响应正文。

开发者明确要求生成v6供再次审查。本轮新增恰好一次真实调用purpose：`chapter-001-summary-level-2-ingest-v6-official`。调用使用DeepSeek官方provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、同一`chapter-source-normalization/v1`第一章正文、冻结的完整`chapter-summary-level-2-ingest/v6`通用提示词、带机械段落定位编号的同一正文、独立新上下文、官方直连`thinking.type=disabled`和`max_tokens=4000`。不授权自动重试、第二份v6、L1/L3重跑、其它模型/章节、smoke、模型质量复核或额外跨模型审查；成功或失败均耗尽本次授权。响应必须严格满足`choices.length === 1`且`choices[0].message.content`为非空字符串，否则调用失败且不保存任何响应正文。

开发者明确授权恰好一次真实调用purpose：`chapter-001-summary-level-2-ingest-v6-official-retry`。调用复用SHA-256为`1c425174a666305bfeecdfffbd8d856cdd1304505f65d248bfa0881c5cdaf7b2`的冻结v6 prompt、SHA-256为`78dfdafd12c47f307885f0611acb736f434eabdbe07ca8a56b15822e51306e74`的同一编号正文、DeepSeek官方provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、独立新上下文、`thinking.type=disabled`和`max_tokens=4000`。不授权自动重试、第二次retry、v7、其它模型/章节、smoke、模型质量复核或额外跨模型审查；成功或失败均耗尽本次授权。严格要求`choices.length === 1`且候选正文非空；满足后必须在质量校验前原样保存，锚点与长度只记录不拒绝。

开发者明确要求执行v7。本轮新增且仅有恰好一次真实调用purpose：`chapter-001-summary-level-2-dual-layer-v7-official`。调用使用DeepSeek官方provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、同一`chapter-source-normalization/v1`第一章正文、冻结的`chapter-summary-level-2-dual-layer/v7`通用双层提示词、`P001–P077`机械编号正文、调用方提供的首个剧情段号`P005`、独立新上下文、`thinking.type=disabled`和`max_tokens=8000`。只允许官方`POST /chat/completions`单次`fetch`，不授权自动重试、第二份v7、v8、其它模型/章节、smoke、模型质量复核或额外Provider调用；成功或失败均耗尽授权。严格要求`choices.length===1`且正文非空。唯一候选先写入受控系统Temp，随后解析；仓库只允许无锚可读正文、移除quote的脱敏证据JSON、白名单stats和walkthrough，原始候选/quote/响应封套/异常正文不得持久化。

开发者随后明确授权恰好一次真实调用purpose：`chapter-001-summary-level-2-brief-only-v7-official`。该调用使用DeepSeek官方provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com`、旧合同`chapter-summary-level-2-brief-only/v7`及其prompt `chapter-001-summary-level-2-brief-only-prompt-v7.md`。该旧prompt明确要求`6–10`个自然段和目标`950–1200`个可见字；旧执行器还把段落数设为保存前硬门禁。唯一调用已执行并耗尽授权，不能用于`v7-repaired`。

开发者最新要求删除旧脚本并重写最小执行器，不构成新的Provider调用授权。待授权合同为`chapter-summary-level-2-brief-only/v7-repaired`，purpose为`chapter-001-summary-level-2-brief-only-v7-repaired-official`；本轮只能做本地编译和`NBOOK_PREFLIGHT_ONLY=1`零网络预检。

开发者随后明确：本Task后续模型调用无需逐次请求授权。Leader可在当前V7纯brief目标、DeepSeek官方provider/model、同一第一章来源、单次fetch、零重试和既定隐私边界内继续独立attempt；每次必须使用新的prompt version、purpose、brief与stats路径，成功或失败都记录，不能覆盖既有证据。该持续授权不包含其它模型、其它章节、浏览器人工验收、产品写入、数据变更或远端动作。

## 凭据与隐私边界

- 凭据只由调用进程从现有配置读取并传给 HTTP client，不写入命令参数、环境转储、Task、walkthrough、HTML、JSON、日志或错误正文。
- 优先使用 `nb-memory` 当前配置；若不存在，使用开发者指定的本机 NeuroBook 配置。只选择启用的 DeepSeek V4 Flash 连接。
- 持久产物只记录 provider 标识、model 标识、脱敏 baseURL 主机和调用统计。
- 原始请求/响应 scratch 使用系统临时根；最终 evidence 只保存经过解析、字段白名单和秘密扫描的结构化结果。
- HTTP 失败只记录状态码、耗时和脱敏错误类别；不持久化请求 header、响应 body 或配置对象。

## 非目标

- 不修改业务源码、Proposal、Spec、数据库或 Project Workspace。
- 不把候选投影写入真实 World Engine 或 Plot 数据库。
- 不声称单章实验已经证明全书处理质量或最终模块边界。

## 当前执行状态

- 上一轮 brief/graph/HTML/统计/结果报告均已产生并完成验证。
- 本轮固定提示词已完成；第一次执行在 0 次模型调用时发现 `llmlint` cleaner 与上一轮来源规范不同并正确阻断。Leader 已从上一轮会话恢复并机械复现 `chapter-source-normalization/v1` 的 `2122` 字符、`2044` 可见字与固定 SHA-256。
- L1 研究保持暂停，全部基线文件不动。`opencode` 路径下 L2 v2 两次失败、L3 v2 成功的证据保持原样。DeepSeek 官方 provider `deepseek` / model `deepseek-v4-flash` / host `api.deepseek.com` 的唯一 L2 v2 调用成功：`773` 可见字、`11301ms`、usage `2070/1072/3142`、semantic retries `0`。原始输出与官方独立统计已落盘，临时脚本已删除。复审确认契约阶段和部分未决信息改善，但叙事顺序、实际称呼、自称主语和未决项完整性仍不通过，因此成品等待开发者审查，不直接用于唯一 ingest。
- L2 v3 完整提示词已独立冻结，文件 SHA-256 `c94c940bea489ec4e4acc690d66434f5afbda894ad72c0172f5689a9ca5352bf`。正式调用前发现通用 `callModelDetailed` 的 pi-ai 层固定 `maxRetries: 2`，不满足“恰好一次”授权，因此没有执行该路径；改用官方 `POST /chat/completions` 的单次 `fetch`，脚本层禁用重定向与全部重试。
- 唯一 L2 v3 官方调用成功：`httpRequestsAttempted=1`、HTTP `200`、finish reason `stop`、`5900ms`、usage `2297/591/2888`。官方直连使用 `thinking.type=disabled`；v2 经 pi-ai 使用 `reasoning:false`，未验证两者完全等价，因此 v2/v3 不是严格的提示词单变量对照。
- v3 脚本读取 `choices[0].message.content` 并拒绝非字符串/空正文，但没有拒绝 `choices.length > 1`；响应封套未保存，因此 v3 实际候选数不可追溯。v3 原始输出 `891` 可见字、SHA-256 `b90f05f286b16d1660112e1babb3e505198163cec57a60542f0b4c463b51165f`。
- L2 v4 完整提示词 SHA-256 为 `fc66779e7fa0951cbe818c22d32ab526bf91c3d23c9946699522efa57d77d96e`。唯一官方调用成功：`httpRequestsAttempted=1`、严格 `observedChoiceCount=1`、HTTP `200`、finish reason `stop`、`6270ms`、usage `2637/774/3411`。原始输出 `1150` 可见字、保留率 `56.26%`、SHA-256 `c34d293aeb102881c50ebd1dedcba968947955d3c6878060f006de4d83814808`；临时脚本和编译文件已删除。
- v4 静态复审：7 个主要节点的排列顺序、倒叙与相对时间锚、太奶临终感知真实性边界、尾巴主观触感、原身体主人疑问、人物声音和实际称呼通过；这不覆盖节点内部缺陷。第 4 节“星界使者”主语仍含混，第 6→7 节奴隶契约心理局部顺序错误且源于 v4 提示词自身误写；最佳适格者原因仍漏标未知，长度超上限 `300` 字。内容逻辑仅部分通过，L2 密度和唯一 ingest 合同不通过。
- L2 v5 通用提示词经三轮隔离对抗审查后冻结，文件 SHA-256 为 `f1f0c0f1dfb6e944736cf146a442dfe983a4cd6c14338e5fa1b3ca5c84335b28`；System Prompt 未出现样章专名、节点、答案或未知项。开发者选择跳过额外跨模型审查。
- 唯一 L2 v5 官方调用成功：`httpRequestsAttempted=1`、严格 `observedChoiceCount=1`、HTTP `200`、finish reason `stop`、`163ms`、usage `2917/326/3243`。原始输出 `486` 可见字、保留率 `23.78%`、SHA-256 `155c65d1fe04a7697f0f7ff953673a8594d47640bf4245a105d871a28d7a6f6e`；低于目标下限 `164` 字。
- v5 静态去样章耦合通过，但第一章回归不通过：再次把倒叙改成时间正序，将太奶临终感知和尾巴主观触感事实化，把“星界使者”身份错分给苏天晴，并漏开场问名、时间锚、原身体主人认知、实际称呼、部分契约阶段和未知项。不能宣称跨作品泛化或唯一 ingest 适用性。
- v5 产物验证：stats 合同断言通过；新增 v5 证据秘密模式命中 `0`；README 双清单登记完整；`docs:check` 检查 `5335` 个文件无失败；`governance:check` 无失败或警告；`git diff --check` 仅既有 LF/CRLF 策略警告；一次性脚本目录已删除。
- 开发者最终裁决已写入`walkthroughs/2026-08-27-summary-level-2-v4-v5-decision.md`：v4正文限定接受，v4通用提示词否决，v5正文否决，v5通用方向证据不足。
- L2 v6冻结提示词SHA-256为`1c425174a666305bfeecdfffbd8d856cdd1304505f65d248bfa0881c5cdaf7b2`。零网络预检复现来源`3023/2122/2044`与固定hash，机械编号为`P001–P077`，编号正文SHA-256为`78dfdafd12c47f307885f0611acb736f434eabdbe07ca8a56b15822e51306e74`，样章禁词命中`0`，`httpRequestsAttempted=0`。
- 唯一L2 v6官方请求已执行：`httpRequestsAttempted=1`、应用层/库层重试均为`0`，HTTP响应成功，严格单候选和非空正文通过；候选锚点段数在`6–12`范围内，完整覆盖`P001–P077`，gap/overlap/out-of-bounds均为`0`。锚点后正文`957`字，超`820`上限`137`字。
- v6一次性执行器错误地把长度越界作为保存前拒绝条件；HTTP response成功，但保存阶段被本地长度校验中止，正文和响应封套未持久化。具体HTTP状态、finish reason、usage、正文hash和具体锚点段数未进入首次失败日志，当前不可追溯。
- 恢复检查确认：临时运行目录仅有脚本，正式evidence无正文，当前会话无后台job或输出artifact；脚本在长度校验通过前不写文件，终端捕获只含错误类别。候选正文无法从现有痕迹安全恢复，v6语义质量为`evidence-insufficient`。
- 首次v6保存中止闭合时的治理验证：统计合同断言通过；当时新增v6证据秘密模式命中`0`，首次候选正文未持久化；`docs:check`检查`5339`个文件无失败；`governance:check`无失败或警告；`git diff --check`仅既有LF/CRLF策略警告；首次一次性脚本已删除。后来独立授权的唯一retry正文保存为`chapter-001-summary-level-2-ingest-v6-retry.md`并另行验证。
- v6唯一retry已执行并耗尽授权：HTTP`200`、finish reason`stop`、`153ms`、usage`2776/599/3375`，`httpRequestsAttempted=1`且零重试；严格唯一非空候选在质量校验前原样保存，SHA-256为`b0c1d90064b19df507deaf8eef80bc8b46504a80d7bdd233f03e05ef75420a47`。
- retry正文含10个锚点段，`P001–P077`连续全覆盖且gap/overlap/out-of-bounds/reversed range均为`0`；锚点后`770`可见字，命中`700–820`目标。
- 人工复审：全局“昏暗房间→五分钟前回忆→返回当前”顺序、星界使者主语、契约主阶段、人物声音通过；但`[P017-P024]`和`[P032-P040]`使用区间外后文，`[P001-P008]`跳过最早问名并新增“醒来”，感知因果与生死状态漂移，漏“两分钟前”“小破书”和多项未决边界。可读L2基本通过但有高严重度事实问题，唯一ingest不通过，当前不取代v4。
- 开发者最终审查v6 retry后明确否决其正文：可见`[P001-P008]`等来源锚破坏阅读，摘要仍漏古书问名/苏天晴回答，并存在既有感知、状态和未决项问题；v4继续是当前最佳正文。开发者要求基于此前讨论生成v7。
- retry产物验证：stats合同断言、正文hash、秘密扫描与双清单登记均通过；`bun run docs:check`检查`5342`个文件无失败；`bun run governance:check`无失败或警告；`git diff --check`仅既有LF/CRLF策略警告；一次性执行器已删除。验证中误用的两个`pnpm`命令均在检查器启动前失败并扰动`node_modules`布局，随后通过`bun install --frozen-lockfile --ignore-scripts`按既有锁文件恢复`138`个包，再用正确`bun run`入口获得有效结果。

- L2 v4、v5、v6首次调用和v6唯一retry授权均已耗尽；v6正文已被开发者否决，v4继续作为第一章质量基准。
- 开发者先要求V7双层产物，随后改为只生成brief。双层V7、旧纯brief及前三个repaired attempt均因宿主输出合同或连续8字门禁未形成正文，历史stats独立保留。
- `v7-repaired-v3`首次形成脱敏泄露诊断：首个重合`11`可见字、brief偏移`104–115`、来源偏移`388–399`及hash，不含匹配文本。
- `v7-repaired-v4`只把开发者已接受的V4底稿发送给模型，原章节未发送；调用HTTP`200`、finish`stop`、usage`1095/1006/2101`，形成`1418`可见字、`7`段候选。完整宿主扫描发现该候选有`11`处来源连续重合，长度`8–11`字，并带入“侵占此身”等事实增强，因此候选移回Temp，不作为正式产物。独立v5局部改写调用HTTP`200`、usage`1226/1007/2233`，但未消除这`11`处重合，故未保存正文。
- 宿主随后对v4候选做确定性局部改写，修正炸毛原因、触感归属、星界使者主语和“侵占此身”等事实边界。最终`evidences/chapter-001-summary-level-2-brief-only-v7-final.md`为`979`可见字、`7`段、来源连续8字重合数`0`；trim后正文SHA-256为`645122080c83324505f38b3d5b7492d62ea5cc5cbcb261f7855323848dac27e8`，含末尾LF的文件字节SHA-256为`ee22e55838b4fb69d6b87ba8121e2b08ede3a6c887a11e04be277d8e86a786f2`。该文件已被开发者接受为第一章当前L2 canonical。按开发者清理指令，历史对照与其余优化中间产物已随目录整理移除，目录只保留各级最终提示词与结果、图谱交付物、研究结论和生成脚本。
- 开发者已明确本 Task 后续模型调用无需逐次授权。当前停止调用；Task 进入清理与收尾。V4 仍是既有质量基线。目录整理已完成：保留登记正文、各级最终提示词与结果、图谱交付物、研究结论、生成脚本以及后续 t02/t03 研究成果。Task 保持 `in-progress`，研究 `browser` 等未运行项不宣称完成。
- L3 v3 提示词定稿：`evidences/chapter-001-summary-level-3-prompt-v3.md`。沿用 L2 v5 之后的通用原则：System Prompt 不含样章专名、节点、答案或未知项，作品名/章节/正文只作 User 参数；目标 `180–300` 可见字、`3–6` 句话，保留关键信息揭示顺序与来源边界，短原话最多 1 处。已校验专名命中 `0`。
- L3 v3 已执行三次真实调用（purpose `chapter-001-summary-level-3-v3-official`）：均 HTTP`200`、finish`stop`、严格单候选非空、`httpRequestsAttempted=1`、零重试；usage 依次为`1757/127/1884`、`1757/138/1895`、`1757/169/1926`。三次候选均命中来源连续8–9字重合门禁，stats独立保留。落盘正文是宿主改写稿而非模型原始候选：宿主确定性改写4处命中短语（`最优秀的适格者。`、`"取之不尽的财富`、`上最通用的两个愿望`、`走上反派魔法少女`），并把两处引号原话收敛为0处（满足"最多1处"）、首句补"恍惚"感知标注后形成`evidences/chapter-001-summary-level-3-v3.md`：`246`可见字、`4`句、来源连续8字重合数`0`、trim后正文SHA-256 `6fe7ad85fdd27d2d3e332e76b8d694359b8843f35b0702643ffd51e6c8da036d`、含末尾LF的文件字节SHA-256 `5e5bdb1b5aed2d87cfa2da24ce7d79989a119a696fe274f0266457575782b52d`。正文等待开发者审查，未宣称泛化。
