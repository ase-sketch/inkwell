import {request as nodeRequest, type IncomingHttpHeaders} from "node:http";

type WorkerProcess = ReturnType<typeof Bun.spawn>;

interface EventData {
    readonly seq: number;
    readonly eventEpoch: string;
    readonly kind: string;
    readonly event?: {readonly type?: string};
}

interface SseFrame {
    readonly id?: string;
    readonly event?: string;
    readonly data: EventData;
}

interface HttpResponse {
    readonly statusCode: number;
    readonly headers: IncomingHttpHeaders;
    readonly text: string;
}

interface InvokeBody {
    readonly invocationId: string;
    readonly status: string;
    readonly beforeSeq: number;
    readonly afterSeq: number;
}

interface InvokeResponse {
    readonly statusCode: number;
    readonly body: InvokeBody;
}

const workerPath = process.env.NEURO_HARNESS_WORKER;
if (!workerPath) throw new Error("NEURO_HARNESS_WORKER 未设置");
const proc = Bun.spawn({cmd: [process.execPath, workerPath], stdout: "pipe", stderr: "inherit"});
const requestAbortController = new AbortController();
const pendingRequests: Promise<unknown>[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function parseEventData(value: unknown): EventData {
    if (!isRecord(value) || typeof value.seq !== "number" || !Number.isSafeInteger(value.seq)
        || typeof value.eventEpoch !== "string" || typeof value.kind !== "string") {
        throw new Error("SSE data 不是有效 Harness event");
    }
    const event = isRecord(value.event)
        ? (typeof value.event.type === "string" ? {type: value.event.type} : {})
        : undefined;
    return event === undefined
        ? {seq: value.seq, eventEpoch: value.eventEpoch, kind: value.kind}
        : {seq: value.seq, eventEpoch: value.eventEpoch, kind: value.kind, event};
}

function parseFrames(text: string): SseFrame[] {
    const events: SseFrame[] = [];
    for (const frame of text.split(/\r\n\r\n|\n\n|\r\r/)) {
        let id: string | undefined;
        let event: string | undefined;
        const dataLines: string[] = [];
        for (const rawLine of frame.split(/\r\n|\n|\r/)) {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (line.startsWith("id: ")) id = line.slice("id: ".length);
            else if (line.startsWith("event: ")) event = line.slice("event: ".length);
            else if (line.startsWith("data: ")) dataLines.push(line.slice("data: ".length));
        }
        if (dataLines.length === 0) continue;
        const frameData = parseEventData(JSON.parse(dataLines.join("\n")) as unknown);
        events.push({
            data: frameData,
            ...(id === undefined ? {} : {id}),
            ...(event === undefined ? {} : {event}),
        });
    }
    return events;
}

function fetchEvents(url: URL, headers: Record<string, string>): Promise<HttpResponse> {
    return new Promise((resolvePromise, reject) => {
        const request = nodeRequest(url, {headers, method: "GET", signal: requestAbortController.signal});
        let settled = false;
        let text = "";
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            request.destroy();
            reject(new Error("SSE 请求超时"));
        }, 15000);
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        };
        request.on("response", (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
                text += chunk;
            });
            response.on("end", () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolvePromise({statusCode: response.statusCode ?? 0, headers: response.headers, text});
            });
            response.on("error", fail);
            response.on("aborted", () => fail(new Error("SSE 响应被提前中止")));
            response.on("close", () => {
                if (!settled && !response.complete) fail(new Error("SSE 响应提前关闭"));
            });
        });
        request.on("error", fail);
        request.end();
    });
}

function postInvoke(url: URL, sessionIdValue: number, payload: Record<string, boolean>): Promise<InvokeResponse> {
    return new Promise((resolvePromise, reject) => {
        const body = JSON.stringify({sessionId: sessionIdValue, payload});
        const request = nodeRequest(new URL("/invoke", url), {
            method: "POST",
            headers: {"content-type": "application/json", "content-length": Buffer.byteLength(body)},
            signal: requestAbortController.signal,
        });
        let settled = false;
        let text = "";
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            request.destroy();
            reject(new Error("invoke 请求超时"));
        }, 15000);
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        };
        request.on("response", (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
                text += chunk;
            });
            response.on("end", () => {
                if (settled) return;
                try {
                    const bodyValue: unknown = JSON.parse(text);
                    if (!isRecord(bodyValue) || typeof bodyValue.invocationId !== "string"
                        || typeof bodyValue.status !== "string" || typeof bodyValue.beforeSeq !== "number"
                        || typeof bodyValue.afterSeq !== "number") {
                        throw new Error("invoke 响应不是有效结果");
                    }
                    settled = true;
                    clearTimeout(timer);
                    resolvePromise({
                        statusCode: response.statusCode ?? 0,
                        body: {
                            invocationId: bodyValue.invocationId,
                            status: bodyValue.status,
                            beforeSeq: bodyValue.beforeSeq,
                            afterSeq: bodyValue.afterSeq,
                        },
                    });
                } catch (error) {
                    fail(error);
                }
            });
            response.on("error", fail);
            response.on("aborted", () => fail(new Error("invoke 响应被提前中止")));
            response.on("close", () => {
                if (!settled && !response.complete) fail(new Error("invoke 响应提前关闭"));
            });
        });
        request.on("error", fail);
        request.end(body);
    });
}

function assertIncreasing(frames: readonly SseFrame[], label: string): void {
    for (let index = 1; index < frames.length; index += 1) {
        const previous = frames[index - 1];
        const current = frames[index];
        if (previous === undefined || current === undefined || current.data.seq <= previous.data.seq) {
            throw new Error(label + "事件 seq 未严格递增");
        }
    }
}

function assertExactSeqRange(frames: readonly SseFrame[], beforeSeq: number, afterSeq: number, label: string): void {
    if (!Number.isSafeInteger(beforeSeq) || !Number.isSafeInteger(afterSeq) || afterSeq < beforeSeq) {
        throw new Error(label + " invocation seq 边界无效");
    }
    const expected = Array.from({length: afterSeq - beforeSeq}, (_, index) => beforeSeq + index + 1);
    const actual = frames.map((frame) => frame.data.seq);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(label + "事件集合不等于 invocation 的完整 seq 区间");
    }
}

function hasAgentEnd(frame: SseFrame): boolean {
    return frame.data.kind === "runtime" && frame.data.event?.type === "agent_end";
}

async function stopWorker(child: WorkerProcess): Promise<void> {
    if (process.platform === "win32") {
        // Scoop's bun shim creates a child runtime; kill the exact worker tree,
        // otherwise the runtime behind the shim survives the fixture.
        try {
            const killer = Bun.spawn({
                cmd: ["taskkill", "/PID", String(child.pid), "/T", "/F"],
                stdout: "ignore",
                stderr: "ignore",
            });
            await killer.exited;
        } catch {
            child.kill("SIGKILL");
        }
    } else {
        child.kill("SIGKILL");
    }
    await Promise.race([child.exited, new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))]);
}

try {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";
    for (;;) {
        const {done, value} = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolvePromise, reject) => {
            const timer = setTimeout(() => reject(new Error("worker ready 超时")), 15000);
            reader.read().then((result) => {
                clearTimeout(timer);
                resolvePromise(result);
            }, (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            });
        });
        if (done) break;
        output += decoder.decode(value, {stream: true});
        if (output.includes("READY")) break;
    }
    const match = output.match(/READY (\d+) (\d+)/);
    if (!match) throw new Error("worker 未就绪: " + output);
    const base = new URL("http://127.0.0.1:" + Number(match[1]));
    const sessionId = Number(match[2]);
    const firstResponsePromise = fetchEvents(new URL("/events", base), {});
    pendingRequests.push(firstResponsePromise);
    const firstInvokePromise = postInvoke(base, sessionId, {first: true});
    pendingRequests.push(firstInvokePromise);
    const firstInvoke = await firstInvokePromise;
    if (firstInvoke.statusCode !== 200 || firstInvoke.body.status !== "completed") {
        throw new Error("首连 invoke HTTP/结果状态异常: " + firstInvoke.statusCode + "/" + firstInvoke.body.status);
    }
    const firstEventsResponse = await firstResponsePromise;
    if (firstEventsResponse.statusCode !== 200) throw new Error("首连 SSE HTTP 状态异常: " + firstEventsResponse.statusCode);
    if (!String(firstEventsResponse.headers["content-type"]).startsWith("text/event-stream")) {
        throw new Error("首连 SSE content-type 异常: " + firstEventsResponse.headers["content-type"]);
    }
    const firstEvents = parseFrames(firstEventsResponse.text);
    if (firstEvents.length === 0) throw new Error("首连无事件");
    assertIncreasing(firstEvents, "首连");
    assertExactSeqRange(firstEvents, firstInvoke.body.beforeSeq, firstInvoke.body.afterSeq, "首连");
    const firstLastFrame = firstEvents.at(-1);
    if (firstLastFrame === undefined || !hasAgentEnd(firstLastFrame)) throw new Error("首连最后事件不是 agent_end");
    if (!firstEvents.every((frame) => frame.event !== undefined && frame.id === String(frame.data.seq))) {
        throw new Error("首连 SSE frame 缺少与事件 seq 对应的 event/id");
    }
    if (!firstEvents.every((frame) => frame.event === frame.data.kind)) throw new Error("首连 event 字段与 Harness kind 不一致");
    const lastSeq = firstLastFrame.data.seq;
    const epoch = firstEventsResponse.headers["x-event-epoch"];
    if (typeof epoch !== "string" || epoch.length === 0) throw new Error("首连缺少 event epoch");
    if (!firstEvents.every((frame) => frame.data.eventEpoch === epoch)) throw new Error("首连 event epoch 不一致");
    console.log("FIRST_OK");

    // 先完成第二次 invocation，再建立第二个连接；此时续传只能来自 cursor replay，
    // 不能被“默认从当前 tail 开始的 live subscription”伪造通过。
    const secondInvokePromise = postInvoke(base, sessionId, {second: true});
    pendingRequests.push(secondInvokePromise);
    const secondInvoke = await secondInvokePromise;
    if (secondInvoke.statusCode !== 200 || secondInvoke.body.status !== "completed") {
        throw new Error("续传 invoke HTTP/结果状态异常: " + secondInvoke.statusCode + "/" + secondInvoke.body.status);
    }
    if (secondInvoke.body.beforeSeq !== lastSeq || secondInvoke.body.afterSeq <= lastSeq) {
        throw new Error("续传 invocation 没有在首连游标之后产生事件");
    }
    const secondEventsPromise = fetchEvents(new URL("/events", base), {"last-event-id": String(lastSeq), "event-epoch": epoch});
    pendingRequests.push(secondEventsPromise);
    const secondEventsResponse = await secondEventsPromise;
    if (secondEventsResponse.statusCode !== 200) throw new Error("续传 SSE HTTP 状态异常: " + secondEventsResponse.statusCode);
    if (!String(secondEventsResponse.headers["content-type"]).startsWith("text/event-stream")) {
        throw new Error("续传 SSE content-type 异常: " + secondEventsResponse.headers["content-type"]);
    }
    if (secondEventsResponse.headers["x-event-epoch"] !== epoch) throw new Error("续传 event epoch 变化");
    const secondEvents = parseFrames(secondEventsResponse.text);
    if (secondEvents.length === 0) throw new Error("续传无事件");
    assertIncreasing(secondEvents, "续传");
    assertExactSeqRange(secondEvents, lastSeq, secondInvoke.body.afterSeq, "续传");
    const secondLastFrame = secondEvents.at(-1);
    if (secondLastFrame === undefined || !hasAgentEnd(secondLastFrame)) throw new Error("续传最后事件不是 agent_end");
    if (!secondEvents.every((frame) => frame.event !== undefined && frame.id === String(frame.data.seq))) {
        throw new Error("续传 SSE frame 缺少与事件 seq 对应的 event/id");
    }
    if (!secondEvents.every((frame) => frame.data.eventEpoch === epoch)) throw new Error("续传 event epoch 不一致");
    if (!secondEvents.every((frame) => frame.event === frame.data.kind)) throw new Error("续传 event 字段与 Harness kind 不一致");
    console.log("SECOND_OK");

    const wrongEpochPromise = fetchEvents(new URL("/events", base), {"last-event-id": String(lastSeq), "event-epoch": epoch + "-wrong"});
    pendingRequests.push(wrongEpochPromise);
    const wrongEpochResponse = await wrongEpochPromise;
    if (wrongEpochResponse.statusCode !== 409) throw new Error("错误 epoch 未要求 Snapshot recovery");
} finally {
    // 本环境 Bun.serve 的有限流收尾可能留下延迟 listener；测试边界不把该宿主
    // shutdown 行为当成 Harness 合同，driver 只负责回收自己启动的精确 worker 树。
    requestAbortController.abort();
    await Promise.race([
        Promise.allSettled(pendingRequests),
        new Promise((resolvePromise) => setTimeout(resolvePromise, 1000)),
    ]);
    await stopWorker(proc);
}
console.log("STOP_OK");
