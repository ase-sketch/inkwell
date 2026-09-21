import { createHash } from "node:crypto";

import type { DefinitionRegistry } from "./ports";
import type {
    AnyWorkflowDefinition,
    WorkflowDefinitionReference,
} from "./types";

export class WorkflowDefinitionConflictError extends Error {
    constructor(
        readonly key: string,
        readonly version: string,
        readonly registeredManifestHash: string,
        readonly incomingManifestHash: string,
    ) {
        super(
            `Workflow definition ${key}@${version} manifest conflict: `
            + `${registeredManifestHash} != ${incomingManifestHash}`,
        );
        this.name = "WorkflowDefinitionConflictError";
    }
}

export class WorkflowDefinitionNotFoundError extends Error {
    constructor(readonly reference: WorkflowDefinitionReference) {
        super(
            `Unknown workflow definition: ${reference.key}@`
            + `${reference.version}#${reference.manifestHash}`,
        );
        this.name = "WorkflowDefinitionNotFoundError";
    }
}

export function definitionManifestHash(
    definition: AnyWorkflowDefinition,
): string {
    if (definition.manifestHash?.trim()) {
        return definition.manifestHash;
    }
    const canonical = JSON.stringify({
        key: definition.key,
        version: definition.version ?? "1",
        requires: definition.requires ?? null,
        phases: definition.phases ?? [],
        run: Function.prototype.toString.call(definition.run),
    });
    return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function definitionReference(
    definition: AnyWorkflowDefinition,
): WorkflowDefinitionReference {
    return {
        key: definition.key,
        version: definition.version ?? "1",
        manifestHash: definitionManifestHash(definition),
    };
}

export class MemoryDefinitionRegistry implements DefinitionRegistry {
    private readonly definitions = new Map<
        string,
        AnyWorkflowDefinition
    >();

    constructor(definitions: readonly AnyWorkflowDefinition[] = []) {
        for (const definition of definitions) {
            this.register(definition);
        }
    }

    register(definition: AnyWorkflowDefinition): void {
        const reference = definitionReference(definition);
        const key = referenceKey(reference);
        const current = this.definitions.get(key);
        if (current) {
            const currentHash = definitionManifestHash(current);
            if (currentHash !== reference.manifestHash) {
                throw new WorkflowDefinitionConflictError(
                    reference.key,
                    reference.version,
                    currentHash,
                    reference.manifestHash,
                );
            }
            return;
        }
        this.definitions.set(key, definition);
    }

    resolve(
        reference: WorkflowDefinitionReference,
    ): AnyWorkflowDefinition {
        const definition = this.definitions.get(referenceKey(reference));
        if (
            !definition
            || definitionManifestHash(definition) !== reference.manifestHash
        ) {
            throw new WorkflowDefinitionNotFoundError(reference);
        }
        return definition;
    }
}

function referenceKey(reference: WorkflowDefinitionReference): string {
    return JSON.stringify([reference.key, reference.version]);
}
