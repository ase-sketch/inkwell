import {describe, it} from "vitest";

import {validateNitropackPatch} from "#scripts/ci/validate-nitropack-patch";

describe("Nitro 可复现构建 patch", () => {
    it("保持 patch 坐标与实际安装产物可执行", async () => {
        await validateNitropackPatch();
    });
});
