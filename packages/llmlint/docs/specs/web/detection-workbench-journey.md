# 检测工作台用户旅程

> 状态：Accepted（2026-08-16）。
> 范围：登录、入口、上传、进入评判工作区、恢复历史。  
> 非范围：可写模式的编辑交互。

## 1. 路由职责

建议把当前单页拆成两个路由：

| 路由 | 规范名称 | 职责 |
| --- | --- | --- |
| `/contribute` | 检测工作台入口 | 新建检测、填写元数据、查看和搜索自己的历史 |
| `/workbench/:textId` | 评判工作区 | 阅读、检测、revision、Agent 和后续编辑 |

`/` 继续跳转到入口。两个路由都必须经过同一认证守卫。工作区 URL 可以携带 `?revision=<revisionId>&panel=<panelId>`，用于刷新恢复和可复制深链；URL 中不得包含 ordinal 作为唯一身份。

拆路由的理由：上传表单和长期工作区拥有不同生命周期。上传成功后导航到稳定 Text URL，刷新不依赖页面内存，后续组件重构不会反复改入口状态机。

## 2. 主旅程

```text
粘贴正文并填写自述字段
  → 上传
  → 服务器创建 Text + rev0，机器扫描先算后藏
  → 导航 /workbench/:textId?revision=:rev0
  → 加载 WorkspaceSnapshot
  → rev0 的 blind-review：居中只读正文、选区评价和文档评分
  → 用户提交盲评或明确跳过
  → reveal
  → inspect-edit：左侧正文 + 右侧面板
  → 保存草稿为 rev1
  → rev1 的 blind-review
```

### 2.1 登录

- 生产唯一登录入口是 NeuroBook OAuth Authorization Code + PKCE。
- redirect 只允许站内相对路径；协议相对 `//host`、绝对 URL 和非工作台路径必须归一化到 `/contribute`。
- 登录失败保留用户准备上传的正文，前提是正文只存在浏览器本地且用户没有主动清除；不得把未提交正文写入服务端日志或 URL。
- 本地开发可以关闭 OAuth 并使用稳定开发身份；这个模式不得出现在生产配置。

### 2.2 上传字段

入口表单包含：

| 字段 | 必填 | 语义 |
| --- | --- | --- |
| 正文 | 是 | rev0 不可变正文 |
| 自述来源 | 否，默认 `unknown` | `human / ai / mixed / unknown`；只是用户声明 |
| 可见性 | 是，默认 `private` | `private / public`；不等于研究训练 consent |
| 题材 | 否 | taxonomy 稳定 key |
| 体裁 | 否 | taxonomy 稳定 key |
| 视角 | 否 | taxonomy 稳定 key；当前 UI 缺失，目标规格补齐 |
| 作品名 | 否 | 展示和历史检索用，不作为来源真值 |
| 数据处理同意 | 是 | 允许在线检测和保存；公共展示/研究用途另立权限 |

上传表单必须明确区分：

- 可见性控制谁能看到文本。
- 数据处理同意允许本产品执行检测和保存。
- 研究许可控制是否能进入匿名导出、reviewer 校准或作者研究。

第一版可以只提供数据处理同意；研究许可未设计前一律视为未授权。

### 2.3 上传命令

客户端提交用户字段，不提交 `originKind`、uploader、字段来源、charCount、时间戳和 id。服务器必须：

1. 校验 session 与 DTO。
2. 创建 `Text(originKind=uploaded)`。
3. 创建 `rev0(transitionKind=upload, parentId=null)`。
4. 同步运行服务器静态扫描并保存，但不返回机器结果。
5. 异步登记 detector 和 LLM review operation。
6. 只返回 Text、rev0 identity 和下一路由。

同一 HTTP 命令必须保证 Text 和 rev0 原子创建。机器扫描失败不得留下无 rev0 的 Text；外部 detector 不可用不能回滚已经创建的 Text。

## 3. 评判工作区阶段门

Workspace 加载后按当前 head revision 的 reveal 状态进入 [`assessment-workspace.md`](assessment-workspace.md) 定义的阶段：

- 任一 head revision 未揭示：进入 `blind-review`。正文居中、只读、可选择和添加 span 评价；机器高亮、报告、规则、热力图、Agent 和编辑命令不可用。
- 当前 head 已揭示：进入 `inspect-edit`。正文移到左侧，右侧总览、规则和 Agent 面板可用；用户可以打开或恢复 DraftSession。

每个 revision 的盲评或显式 skip 必须先于该 revision 的 reveal。skip 使用 `BlindReviewSkipDto` 持久化，刷新后不重复拦截；不得创建伪 judgment。judgment/skip 写入成功后才能发送 reveal。

## 4. 历史恢复

入口展示当前用户拥有的 Text，至少包含作品名或正文预览、创建时间、revision 数、最新检测状态。选择历史项直接导航稳定工作区 URL。

恢复规则：

- 服务器重新加载 WorkspaceSnapshot，不信任浏览器旧缓存。
- 第一轮工作区只选择唯一 head；历史 revision 浏览与比较延后。
- 未揭示 head 恢复到 blind-review，不启动 reveal、detector retry 或 Agent。
- 持久 DraftSession 必须显式提示恢复，不能静默覆盖 head。
- owner 不匹配和 Text 不存在都返回 404，避免枚举。

## 5. 失败与重试

- 上传 DTO 错误：停留入口并保留表单。
- Text/rev0 创建失败：显示可重试错误，不导航。
- 外部 detector/LLM 不可用：仍进入工作区；各通道标记 `unavailable`，不得显示为 0 分或已完成。
- Workspace 加载网络失败：保留 URL，显示重试；不得创建重复 Text。
- OAuth callback 失败：回登录页并显示有限错误码，不泄露 token、issuer 原始响应或 secret。

## 6. 可访问性与响应式边界

- 上传表单所有字段有可访问 label 和错误说明。
- 主操作只有“上传并进入工作台”。
- 桌面是评判工作区完整目标；窄屏第一版至少支持上传、阅读、revision 切换和报告查看。
- 窄屏可以把工作面板变成底部抽屉，但不得丢失当前 revision 和面板选择。
- 任何响应式变化不得让未揭示机器数据进入 DOM。

## 7. 旅程验收

- 登录后能从入口创建恰好一个 Text 和 rev0。
- 自述来源保持“声明”语义，服务器不会将 uploaded+human 当 ground truth。
- 上传响应不含机器结果。
- 每个 revision 的 blind-review DOM 和网络响应都没有机器详情。
- 用户可以在只读正文上选择 span 并添加评价。
- 提交盲评或 skip 后才 reveal；新 revision 保存后再次进入 blind-review。
- 外部通道失败不阻断正文阅读和人类评价。