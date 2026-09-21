import {beforeEach, describe, expect, it, vi} from "vitest";

const openProjectControl = vi.fn();

vi.mock("nbook/server/api/projects/project-control-plane", () => ({
    requireProjectRefBody: vi.fn(async () => ({projectRoot: "novel-a"})),
}));

vi.mock("nbook/server/workspace-files/project-session", () => ({
    openProjectControl,
}));

describe("POST /api/projects/open", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    });

    it("返回 Lifecycle 发布结果而不是临时 success 响应", async () => {
        const publication = {
            revision: 7,
            project: {
                projectRoot: "novel-a",
                kind: "novel",
                title: "Novel A",
                summary: "",
            },
            change: "none",
        } as const;
        openProjectControl.mockResolvedValue({
            ready: {generation: 3},
            publication,
        });
        const handler = (await import("nbook/server/api/projects/open.post")).default as (
            event: never,
        ) => Promise<unknown>;

        await expect(handler({} as never)).resolves.toEqual(publication);
        expect(openProjectControl).toHaveBeenCalledWith({projectRoot: "novel-a"}, {kind: "user"});
    });
});
