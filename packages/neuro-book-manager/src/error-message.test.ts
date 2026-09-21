import {describe, expect, it} from "vitest";

import {formatCliError} from "#manager/error-message";

describe("Manager CLI错误文本", () => {
    it("保留操作与恢复的全部叶错误", () => {
        const error = new AggregateError([
            new Error("Podman inspect缺少原始镜像引用"),
            new Error("候选容器身份尚未发布，拒绝恢复"),
        ], "Manager操作失败，自动恢复也未完成");

        expect(formatCliError(error)).toBe([
            "Manager操作失败，自动恢复也未完成",
            "- Podman inspect缺少原始镜像引用",
            "- 候选容器身份尚未发布，拒绝恢复",
        ].join("\n"));
    });

    it("展开普通Error的cause", () => {
        expect(formatCliError(new Error("下载失败", {cause: new Error("HTTP 503")}))).toBe([
            "下载失败",
            "- HTTP 503",
        ].join("\n"));
    });
});
