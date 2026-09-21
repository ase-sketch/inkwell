import {z} from "zod";
import {colord} from "colord";
import {themeAppearanceValues, themeVarNames, type ThemeAppearance, type ThemeVarName} from "nbook/shared/theme/theme-vars";
import {triggerBrowserDownload} from "nbook/app/utils/browser-download";

export const THEME_JSON_SCHEMA_VERSION = 1;

const themeVarNameSet = new Set<string>(themeVarNames);

export type ThemeJsonDocument = {
    schemaVersion: typeof THEME_JSON_SCHEMA_VERSION;
    name: string;
    appearance: ThemeAppearance;
    vars: Partial<Record<ThemeVarName, string>>;
};

export type ParseThemeJsonResult =
    | {ok: true; theme: ThemeJsonDocument}
    | {ok: false; message: string};

const ThemeJsonDocumentSchema = z.object({
    schemaVersion: z.literal(THEME_JSON_SCHEMA_VERSION),
    name: z.string().trim().min(1).max(50),
    appearance: z.enum(themeAppearanceValues),
    vars: z.record(z.string(), z.string()).superRefine((vars, ctx) => {
        for (const key of Object.keys(vars)) {
            const value = vars[key] ?? "";
            if (!themeVarNameSet.has(key)) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: `未知主题变量：${key}`,
                });
                continue;
            }
            if (!colord(value).isValid()) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: `主题变量 ${key} 的颜色值不合法：${value}`,
                });
            }
        }
    }),
}).strict();

/**
 * 导出主题 JSON 文本。
 */
export function exportThemeJson(theme: Omit<ThemeJsonDocument, "schemaVersion">): string {
    return JSON.stringify({
        schemaVersion: THEME_JSON_SCHEMA_VERSION,
        name: theme.name,
        appearance: theme.appearance,
        vars: theme.vars,
    } satisfies ThemeJsonDocument, null, 2);
}

/**
 * 解析导入的主题 JSON。
 */
export function parseThemeJson(input: string): ParseThemeJsonResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(input) as unknown;
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "主题 JSON 解析失败",
        };
    }

    const result = ThemeJsonDocumentSchema.safeParse(parsed);
    if (!result.success) {
        return {
            ok: false,
            message: result.error.issues[0]?.message ?? "主题 JSON 格式不正确",
        };
    }

    return {
        ok: true,
        theme: result.data,
    };
}

/**
 * 下载主题 JSON 文件。
 */
export function downloadThemeJson(theme: Omit<ThemeJsonDocument, "schemaVersion">, filename: string): void {
    const blob = new Blob([exportThemeJson(theme)], {type: "application/json;charset=utf-8"});
    triggerBrowserDownload(blob, filename);
}
