# TSX Profile Children Rules

## Why This Exists

The visual editor must match the runtime TSX DSL. A node can be draggable in the editor only if dropping it would produce a template that the runtime can render without changing meaning.

`Message` is the important special case: runtime `Message` accepts `PromptChild[]`, but the editor treats its main body as a string field. Therefore `Message` may only contain children that contribute string content.

## Node Categories

| Category | Nodes | Meaning |
| --- | --- | --- |
| Root | `ProfilePrompt` | Profile template root. |
| Set containers | `HistorySet`, `DynamicSet`, `AppendingSet` | Group messages by persistence and render phase. |
| Message nodes | `Message`, `AIMessage` | Produce chat messages. |
| Tool call node | `ToolCall` | Static assistant tool call preview child. |
| Flow/runtime nodes | `Reminder`, `Watch`, `If` | Conditionally or reactively produce children. |
| String inline nodes | `SkillCatalog`, `ActivatedSkills` | Return string content and must live inside `Message`. |

## Allowed Children

| Parent | Allowed children | Notes |
| --- | --- | --- |
| `ProfilePrompt` | `HistorySet`, `DynamicSet`, `AppendingSet`, `Message`, `AIMessage`, `If` | `SkillCatalog`, `ActivatedSkills`, `ToolCall`, `Reminder`, and `Watch` are not valid at root. Only one `HistorySet` is allowed. |
| `HistorySet` | `Message`, `AIMessage`, `If` | History is rendered as normal prompt messages. `Reminder` and `Watch` are appending/runtime concepts, so keep them out of history. |
| `DynamicSet` | `Message`, `AIMessage`, `If` | Dynamic messages participate in the current model call only. |
| `AppendingSet` | `Message`, `AIMessage`, `Reminder`, `Watch`, `If` | Appending output may also update reminder/watch state. |
| `Reminder` | `Message`, `AIMessage`, `If` | A reminder injects rendered messages when active. Nested reminders/watchers should be avoided. |
| `Watch` | `Message`, `AIMessage`, `If` | Visual form maps to `children`; handwritten templates may still use `render(change)`. |
| `If` | Inherits the nearest non-`If` parent area | Under `AppendingSet`, it may contain `Reminder` and `Watch`; under `HistorySet` or `DynamicSet`, it should stay message-only. |
| `Message` | `SkillCatalog`, `ActivatedSkills` | Main message text is stored in `node.text`; children must be string inline nodes only. No nested `Message`, `AIMessage`, `Reminder`, `Watch`, `If`, or `ToolCall`. |
| `AIMessage` | `ToolCall` | Text is stored in `node.text`; `ToolCall` children become `toolCalls`. |
| `ToolCall` | none | Tool arguments are stored in `node.text` or `args`. |
| `SkillCatalog` | none | Returns string; must be inside `Message`. |
| `ActivatedSkills` | none | Returns string; must be inside `Message`. |

## Editor Enforcement

- `canHaveChildren()` should return true for nodes that display a children drop area. `Message` is allowed to show one, but only for string inline nodes.
- `canInsertNodeIntoParent()` is the frontend source for drag/drop and click-add legality.
- `validateTemplateTree()` is the backend source for saved TSX legality.
- If frontend and backend disagree, backend validation wins and the editor must be updated.

## Current Implementation Notes

- `Message` text remains a plain string field in DTO and UI. Inline string nodes are kept in `children`.
- `SkillCatalog` and `ActivatedSkills` must not be draggable into normal containers directly; users should place them inside a `Message`.
- `ToolCall` must be placed inside `AIMessage`; it is not a regular prompt message.
