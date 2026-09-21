import {flushServerTiming} from "nbook/server/utils/server-timing";

/**
 * 在 Nitro 最终发送响应前统一提交 Server-Timing，避免 route 内 set header 被 dev runtime 覆盖。
 */
export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook("beforeResponse", (event, response) => {
        flushServerTiming(event, response);
    });
});
