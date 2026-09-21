import type * as Monaco from "monaco-editor";
import type {ThemeAppearance} from "nbook/shared/theme/theme-vars";

type ThemeVars = {
    accent: string;
    background: string;
    border: string;
    foreground: string;
    hover: string;
    muted: string;
    selection: string;
};

type ThemePreset = {
    base: Monaco.editor.BuiltinTheme;
    colors: Monaco.editor.IColors;
    rules: Monaco.editor.ITokenThemeRule[];
};

/**
 * Solarized Light 是现成的暖色系主题，这里把它作为 sepia 模式的基础。
 * 参考来源：
 * https://github.com/brijeshb42/monaco-themes/blob/master/themes/Solarized-light.json
 */
const buildSepiaPreset = (vars: ThemeVars): ThemePreset => ({
    base: "vs",
    colors: {
        "editor.background": vars.background,
        "editor.foreground": vars.foreground,
        "editorCursor.foreground": "#000000",
        "editor.lineHighlightBackground": "#EEE8D5",
        "editor.selectionBackground": "#EEE8D5",
        "editorWhitespace.foreground": "#EAE3C9",
        "editorLineNumber.foreground": "#93A1A1",
        "editorLineNumber.activeForeground": vars.foreground,
        "editorGutter.background": vars.background,
        "editorIndentGuide.background1": "#EAE3C9",
        "editorIndentGuide.activeBackground1": "#93A1A1",
    },
    rules: [
        { token: "", foreground: "586E75" },
        { token: "comment", foreground: "93A1A1" },
        { token: "string", foreground: "2AA198" },
        { token: "constant.numeric", foreground: "D33682" },
        { token: "keyword", foreground: "859900" },
        { token: "storage", foreground: "073642", fontStyle: "bold" },
        { token: "entity.name.function", foreground: "268BD2" },
        { token: "support.function", foreground: "268BD2" },
        { token: "markup.heading.markdown", foreground: "268BD2" },
        { token: "markup.heading.1.markdown", foreground: "268BD2" },
        { token: "markup.heading.2.markdown", foreground: "268BD2" },
        { token: "markup.heading.3.markdown", foreground: "268BD2" },
        { token: "markup.heading.4.markdown", foreground: "268BD2" },
        { token: "markup.heading.5.markdown", foreground: "268BD2" },
        { token: "markup.heading.6.markdown", foreground: "268BD2" },
        { token: "markup.bold.markdown", foreground: "586E75", fontStyle: "bold" },
        { token: "markup.italic.markdown", foreground: "586E75", fontStyle: "italic" },
        { token: "markup.list.unnumbered.markdown", foreground: "B58900" },
        { token: "markup.list.numbered.markdown", foreground: "859900" },
        { token: "markup.raw.block.markdown", foreground: "2AA198" },
        { token: "markup.raw.inline.markdown", foreground: "2AA198" },
        { token: "markup.quote.markdown", foreground: "6C71C4" },
        { token: "markup.underline.link.markdown", foreground: "839496" },
        { token: "meta.link.inet.markdown", foreground: "DC322F" },
        { token: "punctuation.definition.link.markdown", foreground: "DC322F" },
        { token: "text.plain", foreground: "6A8187" },
    ],
});

/**
 * 浅色源码模式继续跟当前 IDE 的变量保持一致。
 */
const buildLightPreset = (vars: ThemeVars): ThemePreset => ({
    base: "vs",
    colors: {
        "editor.background": vars.background,
        "editor.foreground": vars.foreground,
        "editorLineNumber.foreground": vars.muted,
        "editorLineNumber.activeForeground": vars.foreground,
        "editorCursor.foreground": vars.accent,
        "editor.selectionBackground": vars.selection,
        "editor.lineHighlightBackground": vars.hover,
        "editorIndentGuide.background1": vars.border,
        "editorIndentGuide.activeBackground1": vars.accent,
        "editorWhitespace.foreground": vars.border,
        "editorGutter.background": vars.background,
    },
    rules: [
        { token: "", foreground: vars.foreground.replace("#", "") },
        { token: "comment", foreground: vars.muted.replace("#", "") },
        { token: "string", foreground: "0F766E" },
        { token: "constant.numeric", foreground: "C2410C" },
        { token: "keyword", foreground: "1D4ED8" },
        { token: "entity.name.function", foreground: "7C3AED" },
        { token: "markup.heading.markdown", foreground: "1D4ED8" },
        { token: "markup.list.markdown", foreground: "C2410C" },
        { token: "markup.quote.markdown", foreground: "0F766E" },
        { token: "markup.raw.inline.markdown", foreground: "BE123C" },
    ],
});

/**
 * 深色源码模式使用更克制的 GitHub/Night Owl 风格混合。
 */
const buildDarkPreset = (vars: ThemeVars): ThemePreset => ({
    base: "vs-dark",
    colors: {
        "editor.background": vars.background,
        "editor.foreground": vars.foreground,
        "editorLineNumber.foreground": vars.muted,
        "editorLineNumber.activeForeground": vars.foreground,
        "editorCursor.foreground": vars.accent,
        "editor.selectionBackground": vars.selection,
        "editor.lineHighlightBackground": vars.hover,
        "editorIndentGuide.background1": vars.border,
        "editorIndentGuide.activeBackground1": vars.accent,
        "editorWhitespace.foreground": vars.border,
        "editorGutter.background": vars.background,
    },
    rules: [
        { token: "", foreground: vars.foreground.replace("#", "") },
        { token: "comment", foreground: "7D8590" },
        { token: "string", foreground: "A5D6FF" },
        { token: "constant.numeric", foreground: "FFAB70" },
        { token: "keyword", foreground: "FF7B72" },
        { token: "entity.name.function", foreground: "D2A8FF" },
        { token: "markup.heading.markdown", foreground: "79C0FF" },
        { token: "markup.list.markdown", foreground: "E3B341" },
        { token: "markup.quote.markdown", foreground: "8B949E" },
        { token: "markup.raw.inline.markdown", foreground: "7EE787" },
    ],
});

/**
 * 根据 IDE 主题变量生成 Monaco 主题。
 */
export const buildMonacoTheme = (themeId: string, appearance: ThemeAppearance, vars: ThemeVars): Monaco.editor.IStandaloneThemeData => {
    const preset = themeId === "sepia"
        ? buildSepiaPreset(vars)
        : appearance === "dark"
            ? buildDarkPreset(vars)
            : buildLightPreset(vars);

    return {
        base: preset.base,
        inherit: true,
        rules: preset.rules,
        colors: preset.colors,
    };
};
