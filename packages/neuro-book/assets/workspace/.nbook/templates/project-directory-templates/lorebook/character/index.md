---
title: 角色档案
type: note
subtype: directory-index
status: active
icon: user-round
aliases: []
# 别名示例（沉淀具体角色条目时建议填写，用于按需注入命中）：
# aliases:
#   - "角色尊称/全名"
#   - "常见外号/简称"
tags:
  - 目录说明
summary: "Character lorebook category."
refs: []
# 锚点示例（正文后 AI 沉淀强制填写 chapter 与 quote，访谈期可留空）：
# anchors:
#   - chapter: "001-departure" # manuscript 章节目录名或 Plot 章节 name
#     quote: "正文原句引用片段"
#     note: "初次登场或特征揭示"
retrieval:
  enabled: false
  trigger: null
governance:
  source: system-template
  review: reviewed
ext: {}
---

# 角色档案

本目录保存上帝视角角色设定、背景、秘密、关系和作者备注。

## 目录用途

`lorebook/character/` 存储全知视角的角色设定，包括角色的真实动机、隐藏背景、作者意图和剧情真相。与 World Engine subject 不同，lorebook 角色是无状态原型，不追踪剧情中的记忆和心理变化——这些随时间演变的状态记录在 World Engine 时间线。

## 基本结构

子目录按角色名组织，每个角色可包含多个设定文件（如背景、关系、秘密等）。

## 命名约定

角色目录使用 kebab-case，如 `baron-brauer`、`elder-maid`。

## 相关文档

- Lorebook 目录总览与分类规则：[reference/content/lorebook.md](../../../reference/content/lorebook.md)
- Lorebook 与 World Engine 的分工边界：[reference/content/project-structure.md](../../../reference/content/project-structure.md)
