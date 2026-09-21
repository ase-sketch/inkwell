import type { TestVolume } from "nbook/app/components/dnd-test/dnd-test.types";

/**
 * 创建测试用篇章树。
 */
export const createDndTestVolumes = (): TestVolume[] => {
    const definitions = [
        {
            id: "volume-1",
            title: "第一篇 雨城开局",
            summary: "用于测试常规顺序调整。",
            color: "#2457ff",
            chapters: [
                ["chapter-1", "雾港清晨", 3200],
                ["chapter-2", "旧书店来信", 2800],
                ["chapter-3", "钟楼第一次停摆", 4100],
                ["chapter-4", "码头追影", 3600],
            ],
        },
        {
            id: "volume-2",
            title: "第二篇 镜厅回声",
            summary: "用于测试跨篇移动与批量拖拽。",
            color: "#d97706",
            chapters: [
                ["chapter-5", "玻璃门后的客人", 3900],
                ["chapter-6", "夜车十四站", 4400],
                ["chapter-7", "空白底片", 2600],
                ["chapter-8", "镜厅里的人群", 5100],
                ["chapter-9", "灰尘中的徽记", 3000],
            ],
        },
        {
            id: "volume-3",
            title: "第三篇 北岸试航",
            summary: "用于测试空位落点和尾部插入。",
            color: "#0f766e",
            chapters: [
                ["chapter-10", "旧引擎复燃", 3300],
                ["chapter-11", "灯塔下的协议", 4700],
                ["chapter-12", "潮汐图失窃", 3500],
            ],
        },
        {
            id: "volume-4",
            title: "第四篇 预留空篇",
            summary: "专门用于测试拖入空篇。",
            color: "#7c3aed",
            chapters: [],
        },
    ] as const;

    return definitions.map((volume, volumeIndex) => ({
        id: volume.id,
        title: volume.title,
        summary: volume.summary,
        color: volume.color,
        isExpanded: volumeIndex < 3,
        chapters: volume.chapters.map(([id, title, words], chapterIndex) => ({
            id,
            title,
            words,
            volumeId: volume.id,
            sortOrder: chapterIndex,
            summary: `测试描述：${title}`,
        })),
    }));
};
