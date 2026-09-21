import {defineNitroPlugin} from "nitropack/runtime";
import {loadBootAuthEnabledSync} from "nbook/server/config/boot-config";

/**
 * 服务启动时校验并固定 Boot Config，避免非法安全配置延迟到首个请求才暴露。
 */
export default defineNitroPlugin(() => {
    loadBootAuthEnabledSync();
});
