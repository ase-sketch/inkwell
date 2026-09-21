/**
 * 内置主题 ID。
 *
 * 该列表放在 shared 层，避免 server 为校验主题配置而 import app 目录。
 */
export const builtInThemeIds = ["sepia", "light", "dark", "catppuccin", "dracula", "monokai", "one-dark-pro", "tokyo-night"] as const;
export type BuiltInThemeId = typeof builtInThemeIds[number];

/**
 * 主题外观模式。Monaco 与自定义主题派生会按它选择明暗策略。
 */
export const themeAppearanceValues = ["light", "dark"] as const;
export type ThemeAppearance = typeof themeAppearanceValues[number];

/**
 * 主题变量名。JSON DTO 中不带 CSS `--` 前缀，写入 CSS 时再补前缀。
 */
export const themeVarNames = [
    "bg-main",
    "bg-panel",
    "bg-sidebar",
    "bg-subtle",
    "bg-input",
    "bg-hover",
    "text-main",
    "text-secondary",
    "text-muted",
    "text-inverse",
    "border-color",
    "border-strong",
    "border-accent",
    "accent-main",
    "accent-bg",
    "accent-text",
    "status-info",
    "status-info-bg",
    "status-info-border",
    "status-success",
    "status-success-bg",
    "status-success-border",
    "status-warning",
    "status-warning-bg",
    "status-warning-border",
    "status-danger",
    "status-danger-bg",
    "status-danger-border",
    "editor-bg",
    "source-bg",
    "source-text",
    "source-muted",
    "shadow-color",
    "selection-bg",
    "toolbar-bg",
    "chat-ai-bg",
] as const;

export type ThemeVarName = typeof themeVarNames[number];

/**
 * 用户自定义主题。vars 允许缺键，前端 resolve 时按 appearance 选择内置预设补齐。
 */
export type CustomThemeDto = {
    id: string;
    name: string;
    appearance: ThemeAppearance;
    vars: Partial<Record<ThemeVarName, string>>;
};
