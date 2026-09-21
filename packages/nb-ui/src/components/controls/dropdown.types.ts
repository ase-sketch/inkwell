/**
 * 下拉菜单项。
 */
export interface DropdownItem {
    label: string;
    value: string;
    active?: boolean;
    disabled?: boolean;
    iconClass?: string;
    rightIconClass?: string;
    /** 右侧快捷键提示（如 ⌘K） */
    shortcut?: string;
    /** danger 用于删除等破坏性动作，文字与悬停底色使用 --status-danger */
    tone?: "default" | "danger";
    /** 为 true 时渲染为分隔线，label/图标被忽略；value 仍作为列表 key，用 "sep-1" 之类占位 */
    separator?: boolean;
}
