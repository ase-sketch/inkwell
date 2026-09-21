import {describe, expect, it} from "vitest";
import {clampResizablePanelSize} from "../composables";
import {resolveApiErrorMessage} from "./api-error";

describe("nb-ui utilities", () => {
    it("resolves nested API error messages", () => {
        expect(resolveApiErrorMessage({data: {message: "请求失败"}}, "fallback")).toBe("请求失败");
        expect(resolveApiErrorMessage({message: "普通错误"}, "fallback")).toBe("普通错误");
        expect(resolveApiErrorMessage(null, "fallback")).toBe("fallback");
    });

    it("clamps resizable panel sizes", () => {
        expect(clampResizablePanelSize(10, 20, 100)).toBe(20);
        expect(clampResizablePanelSize(120, 20, 100)).toBe(100);
        expect(clampResizablePanelSize(50, 20, 100)).toBe(50);
    });
});
