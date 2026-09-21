import {describe, expect, it} from "vitest";
import {AsyncSemaphore} from "#cache/concurrency";

describe("AsyncSemaphore", () => {
    it("排队 waiter abort 后不会残留计数或占用后续槽位", async () => {
        const semaphore = new AsyncSemaphore(1);
        const activeController = new AbortController();
        const queuedController = new AbortController();
        const release = await semaphore.acquire(activeController.signal);
        const queued = semaphore.acquire(queuedController.signal);
        expect(semaphore.queuedCount).toBe(1);

        queuedController.abort(new Error("cancelled"));
        await expect(queued).rejects.toThrow("cancelled");
        expect(semaphore.queuedCount).toBe(0);
        release();

        const nextRelease = await semaphore.acquire(new AbortController().signal);
        expect(semaphore.activeCount).toBe(1);
        nextRelease();
        expect(semaphore.activeCount).toBe(0);
    });
});
