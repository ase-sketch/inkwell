# Agent Note: 大纲/细纲文稿（outline/ 资产根）

Status: implemented

## Problem

长篇小说创作离不开大纲（全书总纲）与细纲（卷章级展开），但 Inkwell 目前没有它们的家：基座的 Plot 工作台是重型数据库结构（故事/阶段/线程/场景），已随旧壳「藏而不删」，对作者过重；塞进 manuscript/ 会污染正文（用户原话「肯定不能和正文放在一起」）；塞进 lorebook/ 会混淆设定体系。同时用户明确：聊天态也要能对照大纲——聊大纲是大纲成型的主要场景。

## Decision

**存储：workspace 新增顶层 outline/ 目录，作者可见的第二个资产根。**
- 大纲（总纲）：outline/ 根层平铺，每份一个目录（outline/001-outline/index.md 顺延），可有多份（主线大纲/番外大纲）。
- 细纲：outline/<NNN>-volume/<NNN>-chapter/index.md，与正文卷章编号同构对应，写到哪章看哪章。
- 投影规则纯路径判定（writing-assets.ts 扩展）：outline/ 下匹配 NNN-volume/NNN-chapter 模式的是细纲，其余根层文档是大纲。正文树投影不变（仍只含 manuscript/）。
- 新建走既有 createWorkspaceFile + 手写 frontmatter（buildChapterMarkdown 同构）。frontmatter type 字段：实现时先验证 createWorkspaceFile 是否过服务端 zod 枚举校验；若被拦，把 "outline" 附加进 WORKSPACE_CONTENT_TYPES（同时 grep shared/app 镜像处一并补），优先零服务端改动。

**UI：文稿 UI 跨聊天/工作两界面。**
- 码字态：文稿面板分「正文 / 大纲 / 细纲」三区，各区带新建按钮（细纲新建挂在选中卷下或顺延序号）。
- 聊天态：侧栏一级导航加「大纲」入口，右侧抽屉（复用设定抽屉模式）展示大纲+细纲树，只读浏览——编辑回码字态做，与设定抽屉「只读浏览」定位一致。
- 内部文件原则不变：agents/、world-engine/ 等依旧不进作者界面。

**红线边界：大纲/细纲不是正文。** agent 对 outline/ 的读写不受「不代写正文」限制（讨论/整理大纲是访谈的本职），但本期 agent 只读——agent 写入需要确认流（proposal 卡），属后续里程碑。

## Alternatives considered

- **复用基座 Plot 工作台**：重型结构、独立数据库、与「文档即资产」的轻薄路线相悖；已藏而不删，不回迁。
- **大纲并入 lorebook/**：设定体系是「世界里有什么」，大纲是「故事怎么走」，混在一起两边都变难找；用户明确否决混放。
- **聊天态主区左侧常驻大纲面板**：挤占对话宽度，且与码字态面板形态不统一；用户已选右侧抽屉式。
- **细纲全书一份长文档**：长篇后定位困难；按卷→章与正文同构，查找与对照成本最低（用户已选）。

## Consequences

- writing-assets.ts 从「只投正文」扩为「正文 + 大纲 + 细纲」三投影；IdeManuscriptPanel 分区化；新增 IdeOutlineDrawer（复用抽屉/只读预览模式）。
- Plot 工作台迁移价值进一步降低——文档化大纲若够用，Plot 可能永不回迁（留待 M3/M4 评估）。
- 大纲 agent 写入（访谈聊完落大纲）自然衔接 M1c proposal 卡与 M2 skill 双轨制（追问库产出物以大纲文档沉淀）。