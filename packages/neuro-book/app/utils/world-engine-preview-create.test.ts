import {describe, expect, it, vi} from "vitest";
import {
    refreshPreviewProjectCreate,
    runPreviewProjectCreate,
    type PreviewCreateRefresh,
} from "nbook/app/utils/world-engine-preview-create";
import type {ProjectCreateResponseDto} from "nbook/shared/dto/project.dto";

const createdProject: ProjectCreateResponseDto = {
    revision: 7,
    project: {
        projectRoot: "preview-created",
        kind: "novel",
        title: "Preview created",
        summary: "",
    },
};

const activatedRefresh: PreviewCreateRefresh = {
    selectedProjectRoot: "preview-created",
    activated: true,
};

describe("World Engine Preview Project create", () => {
    it("普通 POST 失败直接拒绝，不读取 Catalog", async () => {
        const postError = new Error("validation failed");
        const request = vi.fn().mockRejectedValue(postError);
        const refresh = vi.fn();

        const result = await runPreviewProjectCreate({
            request,
            refresh,
            classifyCommit: () => null,
        });

        expect(result).toEqual({status: "rejected", error: postError});
        expect(request).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("POST 成功但 Catalog 失败时保留已知 root 和 committed true", async () => {
        const refreshError = new Error("catalog unavailable");
        const request = vi.fn().mockResolvedValue(createdProject);
        const refresh = vi.fn().mockRejectedValue(refreshError);

        const result = await runPreviewProjectCreate({
            request,
            refresh,
            classifyCommit: () => null,
        });

        expect(result).toEqual({
            status: "refresh_failed",
            commitState: true,
            preferredProjectRoot: "preview-created",
            error: refreshError,
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("preview-created");
    });

    it("transport unknown 刷新成功后不猜 Project root", async () => {
        const request = vi.fn().mockRejectedValue(new Error("connection lost"));
        const refresh = vi.fn().mockResolvedValue(activatedRefresh);

        const result = await runPreviewProjectCreate({
            request,
            refresh,
            classifyCommit: () => "unknown",
        });

        expect(result).toEqual({
            status: "settled",
            commitState: "unknown",
            refresh: activatedRefresh,
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith(undefined);
    });

    it("结构化 committed true 错误仍刷新事实，但不编造 root", async () => {
        const request = vi.fn().mockRejectedValue(new Error("response rejected"));
        const refresh = vi.fn().mockResolvedValue(activatedRefresh);

        const result = await runPreviewProjectCreate({
            request,
            refresh,
            classifyCommit: () => true,
        });

        expect(result).toMatchObject({status: "settled", commitState: true});
        expect(result).not.toHaveProperty("preferredProjectRoot");
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("恢复重试只刷新 Catalog，失败时完整保留原 recovery", async () => {
        const recovery = {commitState: true as const, preferredProjectRoot: "preview-created"};
        const refreshError = new Error("still unavailable");
        const refresh = vi.fn().mockRejectedValue(refreshError);

        const result = await refreshPreviewProjectCreate(recovery, refresh);

        expect(result).toEqual({status: "refresh_failed", ...recovery, error: refreshError});
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("preview-created");
    });

    it("Catalog 成功但激活失败仍结算为创建已提交", async () => {
        const request = vi.fn().mockResolvedValue(createdProject);
        const refresh = vi.fn().mockResolvedValue({
            selectedProjectRoot: "preview-created",
            activated: false,
        });

        const result = await runPreviewProjectCreate({
            request,
            refresh,
            classifyCommit: () => null,
        });

        expect(result).toMatchObject({
            status: "settled",
            commitState: true,
            preferredProjectRoot: "preview-created",
            refresh: {activated: false},
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
