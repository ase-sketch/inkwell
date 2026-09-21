import type {JsonValue} from "./json.js";

/** One Server-Sent Events frame per the WHATWG event-stream format. HTTP serving stays host-owned. */
export interface SseEventInput {
    readonly data: string;
    readonly event?: string;
    readonly id?: string;
    readonly retry?: number;
}

function assertSingleLineField(name: string, value: string): void {
    if (value.includes("\r") || value.includes("\n")) {
        throw new Error(`SSE ${name} 必须是单行且不含 CR/LF`);
    }
}

/** Serializes one SSE event frame (WHATWG event-stream): fixed event/id/retry/data field order, multi-line data split into repeated data: lines, blank-line terminator. */
export function serializeSseEvent(input: SseEventInput): string {
    if (input.data.includes("\r")) {
        throw new Error("SSE data 不能包含 CR");
    }
    if (input.event !== undefined) assertSingleLineField("event", input.event);
    if (input.id !== undefined) assertSingleLineField("id", input.id);
    if (input.retry !== undefined && (!Number.isSafeInteger(input.retry) || input.retry < 0)) {
        throw new Error("SSE retry 必须是非负整数");
    }
    const fields: string[] = [];
    if (input.event !== undefined) fields.push(`event: ${input.event}`);
    if (input.id !== undefined) fields.push(`id: ${input.id}`);
    if (input.retry !== undefined) fields.push(`retry: ${input.retry}`);
    for (const line of input.data.split("\n")) fields.push(`data: ${line}`);
    return `${fields.join("\n")}\n\n`;
}

/** Serializes an SSE comment line (no trailing blank line). */
export function serializeSseComment(text: string): string {
    assertSingleLineField("comment", text);
    return `: ${text}\n`;
}

/** JSON convenience wrapper over serializeSseEvent. */
export function serializeSseJsonEvent(input: {
    readonly data: JsonValue;
    readonly event?: string;
    readonly id?: string;
    readonly retry?: number;
}): string {
    return serializeSseEvent({
        data: JSON.stringify(input.data),
        ...(input.event !== undefined ? {event: input.event} : {}),
        ...(input.id !== undefined ? {id: input.id} : {}),
        ...(input.retry !== undefined ? {retry: input.retry} : {}),
    });
}
