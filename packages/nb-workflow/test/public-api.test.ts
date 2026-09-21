import { describe, expect, test } from "bun:test";

import {
    MemoryActivityExecutor,
    WorkflowRunner,
} from "../src/index";
import type {
    AgentWorkflowDefinition,
    WorkflowContext,
    WorkflowDefinition,
} from "../src/index";

describe("public package API", () => {
    test("Core Workflow runs without Agent or Session ports", async () => {
        const activities = new MemoryActivityExecutor();
        activities.registerAction("public.echo@1", (input) => input);
        const definition: WorkflowDefinition = {
            key: "public-core",
            manifestHash: "sha256:public-core-v1",
            run: async (workflow: WorkflowContext) => (
                await workflow.callAction(
                    "public.echo@1",
                    { ok: true },
                )
            ),
        };
        const runner = new WorkflowRunner(
            {},
            {},
            { activities },
        );

        await expect(runner.start(definition, null)).resolves.toMatchObject({
            status: "completed",
            result: { ok: true },
        });
    });

    test("Agent Workflow is an explicit extension type", () => {
        const definition: AgentWorkflowDefinition = {
            key: "public-agent-extension",
            manifestHash: "sha256:public-agent-extension-v1",
            run: async (workflow) => ({
                hasAgentApi: typeof workflow.agents.create === "function",
            }),
        };

        expect(definition.key).toBe("public-agent-extension");
    });

    test("typed actions need no casts and optional input schemas are enforced", async () => {
        const activities = new MemoryActivityExecutor();
        activities.registerAction<
            { value: number },
            { doubled: number }
        >(
            "public.double@1",
            ({ value }) => ({ doubled: value * 2 }),
            {
                input: {
                    parse(input) {
                        if (
                            typeof input !== "object"
                            || input === null
                            || typeof (input as { value?: unknown }).value
                                !== "number"
                        ) {
                            throw new Error("input must be { value: number }");
                        }
                        return input;
                    },
                },
            },
        );
        const definition: WorkflowDefinition = {
            key: "public-typed-action",
            manifestHash: "sha256:public-typed-action-v1",
            run: async (workflow: WorkflowContext) => {
                const result = await workflow.callAction<
                    { doubled: number },
                    { value: number }
                >("public.double@1", { value: 21 });
                return result.doubled;
            },
        };
        const runner = new WorkflowRunner(
            {},
            {},
            { activities },
        );

        await expect(runner.start(definition, null)).resolves.toMatchObject({
            status: "completed",
            result: 42,
        });

        // schema 拒绝非法输入：run 失败，错误来自 schema
        const failingDefinition: WorkflowDefinition = {
            key: "public-typed-action-bad",
            manifestHash: "sha256:public-typed-action-bad-v1",
            run: async (workflow: WorkflowContext) => {
                const result = await workflow.callAction<
                    { doubled: number },
                    { value: number }
                >(
                    "public.double@1",
                    { value: "not a number" } as unknown as {
                        value: number;
                    },
                );
                return result.doubled;
            },
        };
        const failed = await runner.start(failingDefinition, null);
        expect(failed.status).toBe("failed");
        expect(failed.error).toContain("input must be");
    });
});
