import {writeFileSync} from "node:fs";
import {createServer} from "node:net";

const statePath = process.env.NEURO_BOOK_OWNED_STATE;
if (!statePath) throw new Error("Portable fixture缺少NEURO_BOOK_OWNED_STATE。");

const server = createServer((socket) => socket.end("ok"));
server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Portable fixture没有获得TCP端口。");
    writeFileSync(statePath, JSON.stringify({pid: process.pid, port: address.port}), "utf8");
});
