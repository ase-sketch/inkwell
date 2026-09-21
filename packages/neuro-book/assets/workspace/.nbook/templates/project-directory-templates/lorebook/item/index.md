---
title: 物品
type: note
subtype: directory-index
status: active
icon: package
aliases: []
# 别名示例（沉淀具体物品时填写常用代称、简称等，用于按需注入命中）：
# aliases:
#   - "物品别名"
tags:
  - 目录说明
summary: "Item lorebook category."
refs: []
# 锚点示例（正文后 AI 沉淀强制填写，访谈期可留空）：
# anchors:
#   - chapter: "001-departure" # manuscript 章节目录名或 Plot 章节 name
#     quote: "正文原句引用片段"
retrieval:
  enabled: false
  trigger: null
governance:
  source: system-template
  review: reviewed
ext: {}
---

# 物品

本目录保存物品原型、装备、道具、文档、材料和设备。

## 目录用途

`lorebook/item/` 存储物品的全知设定，包括外观、功能、历史、制作方式和隐藏属性。这里是物品的"原型"，不追踪"谁持有这个物品"或"物品当前耐久度"等动态状态，需要追踪的关键物品登记为 World Engine subject，动态状态记录进时间线。

## 基本结构

子目录按物品类型或名称组织，如 `weapons/`、`artifacts/`、`documents/` 等。

## 命名约定

物品目录使用 kebab-case，如 `cursed-amulet`、`royal-seal`。

## 相关文档

- Lorebook Item 与 World Engine subject 的分工：[reference/content/lorebook.md](../../../reference/content/lorebook.md)
