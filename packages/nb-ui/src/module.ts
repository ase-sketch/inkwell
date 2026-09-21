import {addComponentsDir, addImportsDir, createResolver, defineNuxtModule} from "@nuxt/kit";

export type NbUiModuleOptions = {
    /**
     * 自动注册组件时使用的前缀。默认不加前缀，便于模板项目直接使用 Dialog / IconButton。
     */
    componentPrefix?: string;
    /**
     * 是否自动注入组件库样式。
     */
    injectCss?: boolean;
};

/**
 * Nuxt 接入模块：注册组件、composables，并确保 linked 源码交给 Vite 转译。
 */
export default defineNuxtModule<NbUiModuleOptions>({
    meta: {
        name: "@notnotype/nb-ui",
        configKey: "nbUi",
    },
    defaults: {
        componentPrefix: "",
        injectCss: true,
    },
    setup(options, nuxt) {
        const resolver = createResolver(import.meta.url);
        const packageRoot = resolver.resolve("..");

        nuxt.options.build.transpile.push("@notnotype/nb-ui");
        nuxt.options.vite ||= {};
        nuxt.options.vite.server ||= {};
        nuxt.options.vite.server.fs ||= {};
        const allow = nuxt.options.vite.server.fs.allow ||= [];
        if (!allow.includes(packageRoot)) {
            allow.push(packageRoot);
        }

        if (options.injectCss) {
            // 注入编译产物而不是源码 CSS：消费方（含 UnoCSS 工程）不需要具备 Tailwind 构建能力，
            // 也不需要登记任何图标类。产物由 `bun run build:css` 生成并提交，见 src/tailwind.css。
            nuxt.options.css.push(resolver.resolve("../dist/nb-ui.css"));
        }

        addComponentsDir({
            path: resolver.resolve("./components"),
            pathPrefix: false,
            prefix: options.componentPrefix,
            extensions: ["vue"],
        });
        addImportsDir(resolver.resolve("./composables"));
    },
});
