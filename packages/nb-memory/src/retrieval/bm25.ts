/**
 * 轻量 BM25 字面召回通道（S4）：中文按字 bigram、ASCII 串按整词分词，零依赖。
 * 存在意义：账号名/道具名等专名在 embedding 语义空间召不回（B1 p018/p027 实证），
 * 字面信号补这一路；与语义路的融合（RRF）在 search.ts 做。
 * 文档编号 = 加入顺序，与 SemanticIndex 的条目数组下标对齐。
 */

const K1 = 1.2;
const B = 0.75;

/** 分词：CJK 连续段拆字 bigram（单字段落回单字），ASCII 字母数字串整词小写 */
export function tokenize(text: string): string[] {
    const terms: string[] = [];
    for (const match of text.matchAll(/[a-zA-Z0-9]+|[一-鿿぀-ヿ]+/gu)) {
        const seg = match[0]!;
        if (/^[a-zA-Z0-9]/u.test(seg)) {
            terms.push(seg.toLowerCase());
            continue;
        }
        if (seg.length === 1) {
            terms.push(seg);
            continue;
        }
        for (let i = 0; i < seg.length - 1; i++) terms.push(seg.slice(i, i + 2));
    }
    return terms;
}

export class Bm25Index {
    /** 每文档：词频表 + 长度 */
    private readonly docs: Array<{tf: Map<string, number>; len: number}> = [];
    /** 文档频率 */
    private readonly df = new Map<string, number>();
    private totalLen = 0;

    /** 追加一篇文档（编号 = 当前长度，调用方保证与语义索引对齐） */
    add(text: string): void {
        const tf = new Map<string, number>();
        const terms = tokenize(text);
        for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
        for (const term of tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
        this.docs.push({tf, len: terms.length});
        this.totalLen += terms.length;
    }

    /** 查询：返回 docIndex → BM25 分（仅 >0 的文档） */
    scores(query: string): Map<number, number> {
        const result = new Map<number, number>();
        if (this.docs.length === 0) return result;
        const avgLen = this.totalLen / this.docs.length;
        const queryTerms = [...new Set(tokenize(query))];
        for (const term of queryTerms) {
            const df = this.df.get(term);
            if (df === undefined) continue;
            const idf = Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
            for (const [index, doc] of this.docs.entries()) {
                const tf = doc.tf.get(term);
                if (tf === undefined) continue;
                const score = idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * doc.len / (avgLen || 1)));
                result.set(index, (result.get(index) ?? 0) + score);
            }
        }
        return result;
    }
}
