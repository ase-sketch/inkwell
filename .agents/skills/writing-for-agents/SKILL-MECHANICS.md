# Skill 调用机制

本文件补充 [Agent 指令写作](SKILL.md) 的 Skill 分支。

## Frontmatter 与调用

- 保持稳定的 `name`；`description` 简述用途和触发条件，供支持的宿主发现。参数型入口用 `argument-hint` 说明参数。
- 模型自动调用与用户显式调用的实际能力取决于宿主。需要自动发现时提供清楚的 description；仅显式调用的入口可在宿主支持时设置 `disable-model-invocation: true`。
- `disable-model-invocation` 控制自动调用，不是文件读取权限。缺 description 不等于文件不可引用；没有宿主证据时不承诺零上下文开销。

## 共享参考与路由

用户调用的 Skill 可以直接引用共享文档，不因调用模式强制拆文件。只有独立触发用途值得长期维护时才拆 Skill；已有文件能承载共享参考就复用。

多个入口确需索引时，路由只列用途和链接。能否自动调用目标仍由宿主决定，不把路由当成权限绕过方式。
