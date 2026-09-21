/**
 * 原始内容分块：把一段长文切成抽取器上下文放得下的块。
 *
 * ## 与 RAG 分块的关键区别
 *
 * RAG 里 chunk **就是检索单元**，块边界直接决定召回质量，所以要上语义分块那套重家伙。
 * 本库里 chunk 只是**抽取器的输入窗口**——检索单元是抽取出来的事实。切坏了只要有
 * overlap 或上下文携带，抽取器在下一块还有机会把那条事实补回来。
 *
 * 所以这里刻意只提供简单确定的切法，不做语义分块。真正需要投入的是**跨块携带什么**
 * （见 extract.ts：注册表快照 + 上一块尾部），那才是抽取质量的瓶颈——「得知名字之前
 * 不许用名字」是个跨块状态，第 3 块的抽取器不知道第 2 块里主角已经知道了名字，
 * 就会写错指称，而且错得很隐蔽（下游消解会一本正经地把错误指称归到正确主体上）。
 */

/** 分块选项 */
export interface ChunkOptions {
    /**
     * 切法；缺省 `paragraph`。
     * - `paragraph`：按空行分段后贪心装箱到 maxChars（散文、章节正文）
     * - `heading`：按 Markdown 标题切，标题行留在块首（结构化文档）
     * - `turns`：按对话轮切（行首形如 `用户：` / `A:` / `> ` 的视作新轮）
     * - `chars`：定长硬切（兜底，任何文本都能用）
     */
    strategy?: "paragraph" | "heading" | "turns" | "chars";
    /** 单块最大字符数；缺省 1200（与主仓 subject-rag chunk 上限同口径） */
    maxChars?: number;
    /** 相邻块重叠字符数（从上一块尾部取）；缺省 0 */
    overlap?: number;
    /** 自定义切分；给了它就完全接管，上面的选项全部不生效 */
    split?: (text: string) => string[];
}

const DEFAULT_MAX_CHARS = 1200;

/** 把长文切成块（空文本返回空数组） */
export function chunk(text: string, opts?: ChunkOptions): string[] {
    const trimmed = text.trim();
    if (trimmed === "") return [];
    if (opts?.split) return opts.split(trimmed).map((item) => item.trim()).filter((item) => item !== "");

    const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
    const units = splitUnits(trimmed, opts?.strategy ?? "paragraph", maxChars);
    const packed = pack(units, maxChars);
    return opts?.overlap ? applyOverlap(packed, opts.overlap) : packed;
}

/** 按策略切出「最小不可分单元」，随后再贪心装箱 */
function splitUnits(text: string, strategy: NonNullable<ChunkOptions["strategy"]>, maxChars: number): string[] {
    if (strategy === "chars") return hardSplit(text, maxChars);
    if (strategy === "heading") {
        // 标题行独立成段起点；文首无标题时前置内容自成一单元
        const parts = text.split(/\n(?=#{1,6}\s)/u).map((item) => item.trim()).filter(Boolean);
        return parts.flatMap((part) => hardSplit(part, maxChars));
    }
    if (strategy === "turns") {
        // 「说话人：」或引用行视作新一轮的开头
        const parts = text.split(/\n(?=(?:[^\n：:]{1,12}[：:]|>\s))/u).map((item) => item.trim()).filter(Boolean);
        return parts.flatMap((part) => hardSplit(part, maxChars));
    }
    return text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean).flatMap((part) => hardSplit(part, maxChars));
}

/** 贪心装箱：能塞进同一块的相邻单元合并，超限就开新块 */
function pack(units: string[], maxChars: number): string[] {
    const chunks: string[] = [];
    let current = "";
    for (const unit of units) {
        if (current === "") {
            current = unit;
            continue;
        }
        if (current.length + 2 + unit.length <= maxChars) {
            current = `${current}\n\n${unit}`;
            continue;
        }
        chunks.push(current);
        current = unit;
    }
    if (current !== "") chunks.push(current);
    return chunks;
}

/** 超长单元定长硬切（兜底，保证任何输入都能进抽取器） */
function hardSplit(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) parts.push(text.slice(i, i + maxChars));
    return parts;
}

/** 给每块前置上一块的尾部，减少事实被切断的概率 */
function applyOverlap(chunks: string[], overlap: number): string[] {
    return chunks.map((item, i) => (i === 0 ? item : `${chunks[i - 1]!.slice(-overlap)}\n\n${item}`));
}
