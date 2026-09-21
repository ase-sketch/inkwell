import {writeFileSync} from "node:fs";
import {createServer} from "node:net";

const statePath = process.env.OWNED_PROCESS_STATE_PATH;
if (!statePath) throw new Error("OWNED_PROCESS_STATE_PATH is required");

const server = createServer();
server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TCP fixture did not expose a port");
    writeFileSync(statePath, JSON.stringify({pid: process.pid, port: address.port}), "utf8");
});
