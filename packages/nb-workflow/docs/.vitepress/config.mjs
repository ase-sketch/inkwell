import { defineConfig } from "vitepress";

export default defineConfig({
    title: "nb-workflow",
    description: "会记账的脚本式 Workflow 引擎",
    lang: "zh-CN",
    cleanUrls: true,
    themeConfig: {
        nav: [
            { text: "上手", link: "/guide/" },
            { text: "故事线", link: "/guide/story" },
            { text: "概念", link: "/concepts/activity" },
            { text: "特性", link: "/features/waits" },
            { text: "API", link: "/api" },
        ],
        sidebar: [
            {
                text: "开始",
                items: [
                    { text: "首页", link: "/" },
                    { text: "快速上手", link: "/guide/" },
                    { text: "故事线：每日 AI 简报", link: "/guide/story" },
                ],
            },
            {
                text: "概念",
                items: [
                    { text: "Activity", link: "/concepts/activity" },
                    { text: "journal 与 fingerprint", link: "/concepts/journal" },
                    { text: "重放与恢复", link: "/concepts/replay" },
                    { text: "Backend", link: "/concepts/backend" },
                    { text: "Port 与宿主", link: "/concepts/ports" },
                    { text: "Agent Extension", link: "/concepts/extension" },
                    { text: "能力协商", link: "/concepts/capability" },
                ],
            },
            {
                text: "特性",
                items: [
                    { text: "等待与恢复", link: "/features/waits" },
                    { text: "map/all 并发", link: "/features/concurrency" },
                    { text: "取消", link: "/features/cancel" },
                    { text: "ValueStore 大值", link: "/features/values" },
                    { text: "类型与校验", link: "/features/types" },
                    { text: "可视化", link: "/features/visualization" },
                ],
            },
            {
                text: "参考",
                items: [
                    { text: "API 速查", link: "/api" },
                ],
            },
        ],
        search: {
            provider: "local",
        },
        footer: {
            message: "MIT License",
        },
    },
});
