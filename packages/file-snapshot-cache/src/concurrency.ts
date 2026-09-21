/** 小型公平信号量，用于限制跨 key 的全局构建并发。 */
export class AsyncSemaphore {
    private active = 0;
    private readonly waiters: Array<() => void> = [];

    constructor(private readonly limit: number) {
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new Error("maxConcurrentBuilds must be a positive integer");
        }
    }

    /** 等待一个构建槽位，并返回幂等释放函数。 */
    async acquire(signal: AbortSignal): Promise<() => void> {
        if (signal.aborted) {
            throw signal.reason;
        }
        if (this.active < this.limit) {
            this.active += 1;
            return this.releaseOnce();
        }

        await new Promise<void>((resolve, reject) => {
            const grant = (): void => {
                signal.removeEventListener("abort", abort);
                this.active += 1;
                resolve();
            };
            const abort = (): void => {
                const index = this.waiters.indexOf(grant);
                if (index >= 0) {
                    this.waiters.splice(index, 1);
                }
                reject(signal.reason);
            };
            this.waiters.push(grant);
            signal.addEventListener("abort", abort, {once: true});
        });
        return this.releaseOnce();
    }

    /** 当前正在执行的任务数。 */
    get activeCount(): number {
        return this.active;
    }

    /** 当前等待槽位的任务数。 */
    get queuedCount(): number {
        return this.waiters.length;
    }

    /** 创建只会归还一次的 release。 */
    private releaseOnce(): () => void {
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            this.active -= 1;
            const next = this.waiters.shift();
            next?.();
        };
    }
}
