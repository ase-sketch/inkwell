import {describe, expect, it} from "vitest";

import {
    containsAbsoluteNodeModuleFileUrl,
} from "#scripts/build/nitro-runtime-file-url.mjs";

describe("Nitro Product 绝对依赖路径泄漏", () => {
    it.each([
        "file://C:/Users/name/AppData/Local/Temp/build/node_modules/zod/index.js",
        "file:///C:/Users/NAME~1/AppData/Local/Temp/build/node_modules/zod/index.js",
        "file:///home/user/build/node_modules/zod/index.js",
    ])("识别长路径、8.3短路径和 POSIX 路径：%s", (source) => {
        expect(containsAbsoluteNodeModuleFileUrl(`import '${source}';`)).toBe(true);
    });

    it("相对 Product vendor 路径不属于构建机路径泄漏", () => {
        const source = "import './node_modules/zod/index.js';";
        expect(containsAbsoluteNodeModuleFileUrl(source)).toBe(false);
    });
});
