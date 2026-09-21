import {defineNitroPlugin} from "nitropack/runtime";
import {productShutdownController} from "nbook/server/runtime/shutdown/product-shutdown";

/**
 * Nitro 的 POSIX signal shutdown 进入统一 Product shutdown controller。
 * Manager HTTP shutdown 可能已先启动同一 Promise，因此这里不会重复释放资源。
 */
export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook("close", async () => {
        await productShutdownController.shutdown();
    });
});
