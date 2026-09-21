import {readdirSync, readFileSync, statSync} from "node:fs";
import {createRequire} from "node:module";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

/**
 * 图标名有效性兜底。
 *
 * Tailwind v4 + @iconify/tailwind4 预生成模式下，写错或已被 lucide 改名的图标类
 * **不会报错，只会静默渲染成空白**（阶段 0 实测的 #bogus 行为）。类名本身由
 * src/tailwind.css 的 @source 扫描自动生成规则，不需要手工登记清单；真正会漏的是
 * 「这个名字在图标集里根本不存在」。这条断言守的就是那个失败面。
 *
 * 注意 loader-2 / check-circle-2 / alert-triangle 在 @iconify-json/lucide 里是 alias
 * 而不是 icon，两者都算有效——预生成模式会为 alias 输出规则（已实测）。
 */

type LucideIconSet = {
    icons: Record<string, unknown>;
    aliases?: Record<string, unknown>;
};

/** 递归收集目录下的 .vue/.ts 文件 */
function collectFiles(dir: string): string[] {
    const result: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            result.push(...collectFiles(full));
        } else if (/\.(vue|ts)$/.test(name) && !name.endsWith(".test.ts")) {
            result.push(full);
        }
    }
    return result;
}

function collectUsedIcons(): Set<string> {
    const used = new Set<string>();
    for (const file of collectFiles(join(import.meta.dirname, "components"))) {
        for (const match of readFileSync(file, "utf-8").matchAll(/i-lucide-([a-z0-9-]+)/g)) {
            if (match[1]) {
                used.add(match[1]);
            }
        }
    }
    return used;
}

describe("nb-ui icon names", () => {
    it("resolves every i-lucide-* used in component sources against @iconify-json/lucide", () => {
        const require = createRequire(import.meta.url);
        const iconSet = JSON.parse(
            readFileSync(require.resolve("@iconify-json/lucide/icons.json"), "utf-8"),
        ) as LucideIconSet;

        const used = collectUsedIcons();
        const unresolved = [...used].filter(
            (name) => !Object.hasOwn(iconSet.icons, name) && !Object.hasOwn(iconSet.aliases ?? {}, name),
        );

        expect(used.size).toBeGreaterThan(0);
        expect(
            unresolved,
            `这些图标名在 @iconify-json/lucide 里不存在，会静默渲染成空白: ${unresolved.join(", ")}`,
        ).toEqual([]);
    });

    it("keeps icon class names static so @source scanning can find them", () => {
        // 运行时拼接的图标类名扫描不到，必须改用 src/tailwind.css 的 @source inline 登记。
        // nb-ui 目前没有这种写法，这条断言防止无声引入。
        const dynamic: string[] = [];
        for (const file of collectFiles(join(import.meta.dirname, "components"))) {
            const source = readFileSync(file, "utf-8");
            if (/`i-lucide-\$\{|["']i-lucide-["']\s*\+/.test(source)) {
                dynamic.push(file);
            }
        }

        expect(
            dynamic,
            `这些文件在运行时拼接图标类名，@source 扫描不到: ${dynamic.join(", ")}`,
        ).toEqual([]);
    });
});
