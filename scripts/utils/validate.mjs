/** 输入校验工具。 */

/** 校验端口字符串是否是有效的 TCP 端口。 */
export function validatePort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return '端口必须是 1 到 65535 之间的整数。';
    }

    return undefined;
}
