import {describe, expect, it} from "vitest";

import {spawnPosixOwnedProcess} from "#owned-process/posix-adapter";
import {buildPosixSupervisorSource} from "#owned-process/posix-supervisor-source";

describe("POSIX Owned Process failure", () => {
    it.runIf(process.platform !== "win32")("进程组信号失败会进入结构化ownership failure", async () => {
        const lease = spawnPosixOwnedProcess({
            command: process.execPath,
            args: ["-e", "setTimeout(() => process.exit(0), 500)"],
            stdout: "ignore",
            stderr: "ignore",
        }, {
            supervisorSource: buildPosixSupervisorSource("signal"),
        });

        await expect(lease.terminate("timeout")).rejects.toMatchObject({
            name: "OwnedProcessError",
            stage: "process-group-signal",
        });
    });

    it.runIf(process.platform !== "win32")("进程组探测失败不会从timer回调抛出未捕获异常", async () => {
        const lease = spawnPosixOwnedProcess({
            command: process.execPath,
            args: ["-e", "setInterval(() => undefined, 60000)"],
            stdout: "ignore",
            stderr: "ignore",
            graceMs: 50,
            hardKillWaitMs: 500,
        }, {
            supervisorSource: buildPosixSupervisorSource("probe"),
        });

        await expect(lease.terminate("timeout")).rejects.toMatchObject({
            name: "OwnedProcessError",
            stage: "process-group-probe",
        });
    });

    it.runIf(process.platform !== "win32")("signal 0返回EPERM时继续等待进程组消失", async () => {
        const lease = spawnPosixOwnedProcess({
            command: process.execPath,
            args: ["-e", "process.exit(0)"],
            stdout: "ignore",
            stderr: "ignore",
            graceMs: 50,
            hardKillWaitMs: 500,
        }, {
            supervisorSource: buildPosixSupervisorSource("probe-permission"),
        });

        await expect(lease.completion).resolves.toMatchObject({exitCode: 0});
    });
});
