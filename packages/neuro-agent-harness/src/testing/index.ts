import type {JsonValue} from "../json.js";
import type {ModelRuntime, ModelTurnRequest, ModelTurnResult} from "../model.js";

/** Script item consumed by ScriptedModelRuntime. */
export type ScriptedTurn<TModelConfig extends JsonValue> =
    | ModelTurnResult
    | Error
    | ((request: ModelTurnRequest<TModelConfig>) => ModelTurnResult | Promise<ModelTurnResult>);

/** Deterministic Model Runtime Adapter for public-interface tests. */
export class ScriptedModelRuntime<TModelConfig extends JsonValue = JsonValue> implements ModelRuntime<TModelConfig> {
    readonly requests: ModelTurnRequest<TModelConfig>[] = [];
    private readonly script: ScriptedTurn<TModelConfig>[];

    constructor(script: readonly ScriptedTurn<TModelConfig>[]) {
        this.script = [...script];
    }

    async runTurn(request: ModelTurnRequest<TModelConfig>): Promise<ModelTurnResult> {
        this.requests.push(request);
        const item = this.script.shift();
        if (!item) {
            throw new Error("ScriptedModelRuntime script 已耗尽");
        }
        if (item instanceof Error) {
            throw item;
        }
        const result = typeof item === "function" ? await item(request) : item;
        await request.onEvent?.({type: "message_start"});
        await request.onEvent?.({type: "message_end", message: result.message});
        return result;
    }
}
