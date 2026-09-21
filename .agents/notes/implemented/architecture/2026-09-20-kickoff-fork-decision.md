# 立项决策：fork neuro-book 走小说创作 agent

- **日期**：2026-09-20
- **分类**：决策
- **背景**：Inkwell 最初定位「阅读与辅助写文 agent」，讨论中修正为「专注小说创作、苏格拉底式追问、不代写正文」。
- **决定**：路线 D——fork neuro-book（4590627，0.10.3-canary）改造；分发先 Windows portable zip，Electron 后议；AGPL-3.0 开源、非商用（nb-ui PolyForm 许可因此无碍）。
- **理由**：写作工程化三大件（世界状态/伏笔账本/llmlint）与 BYOK 多渠道模型接入现成；苏格拉底追问已有 request_user_input 挂载点，只需改 prompt+会话闸门+聊天面板三处。
- **影响范围**：全部后续里程碑（见 docs/milestones.md）；技术栈随 fork 锁定（见 docs/tech-stack.md）。
- **被否决方案**：A 自己实现（写作工程化重做成本高）、B fork deepwrite（无阅读侧、底座未验证）、C fork MarkiNote（Python 栈不符）。
