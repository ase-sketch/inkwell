import {lstat, mkdir, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {lock as acquireFileLock} from "proper-lockfile";

import {
    ProductRuntimeImageBuilder,
    type ProductRuntimeExpectedIdentity,
    type VerifiedProductRuntimeImage,
} from "#scripts/build/product-runtime-image-builder";

/** 本地 Publisher 的发布请求；显式 output 与 checkout `.output` 是两种不同合同。 */
export type LocalProductPublishRequest = Readonly<{
    candidate: VerifiedProductRuntimeImage;
    explicitOutputRoot?: string;
}>;

/**
 * 把 ready candidate 交给本地 checkout 或 Manager 提供的空 staging root。
 *
 * 这个 Module 不管理安装、migration、健康提交点或 rollback；受管 Installation
 * 必须由 Manager 完成这些动作。
 */
export class LocalProductPublisher {
    private readonly projectRoot: string;
    private readonly builder: ProductRuntimeImageBuilder;

    /** 绑定 Source Root，并复用 Builder 的唯一完整验证入口。 */
    constructor(projectRoot = process.cwd(), builder = new ProductRuntimeImageBuilder(projectRoot)) {
        this.projectRoot = resolve(projectRoot);
        this.builder = builder;
    }

    /** 发布 candidate；返回值已经在最终路径重新完成完整验证。 */
    async publish(request: LocalProductPublishRequest): Promise<VerifiedProductRuntimeImage> {
        const candidate = await this.builder.openVerified(request.candidate.path, identity(request.candidate));
        if (request.explicitOutputRoot?.trim()) {
            return await this.publishEmpty(candidate, resolve(this.projectRoot, request.explicitOutputRoot));
        }
        return await this.publishCheckout(candidate);
    }

    /**
     * 在本地 `.output` 发布 lease 内消费一个 verified image。
     *
     * callback 完成前 Publisher 不能切换 `.output`；callback 返回后会再次验证同一
     * image，避免归档或其他长读取把两个构建代次混在一起。
     */
    async withPublishedCheckout<T>(
        expectedIdentity: ProductRuntimeExpectedIdentity,
        consume: (image: VerifiedProductRuntimeImage) => Promise<T>,
    ): Promise<T> {
        await this.assertGitCheckout();
        return await this.withCheckoutLease(async () => {
            if (await exists(resolve(this.projectRoot, ".deploy", "installation.json"))) {
                throw new Error("受管 Installation Root 禁止把本地 `.output` 当作发行输入；请使用 NeuroBook Manager。");
            }
            const image = await this.builder.openVerified(resolve(this.projectRoot, ".output"), expectedIdentity);
            const result = await consume(image);
            await this.builder.openVerified(image.path, identity(image));
            return result;
        });
    }

    /** 显式目标只允许不存在或空目录，失败时绝不覆盖调用方已有内容。 */
    private async publishEmpty(
        candidate: VerifiedProductRuntimeImage,
        outputRoot: string,
    ): Promise<VerifiedProductRuntimeImage> {
        this.assertOutputRoot(outputRoot);
        if (await exists(resolve(dirname(outputRoot), ".deploy", "installation.json"))) {
            throw new Error("受管 Installation Root 禁止接收显式 Product output；请使用 NeuroBook Manager。" );
        }
        const existing = await lstat(outputRoot).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
        if (existing) {
            if (!existing.isDirectory() || existing.isSymbolicLink() || (await readdir(outputRoot)).length > 0) {
                throw new Error(`NEURO_BOOK_OUTPUT_DIR 必须不存在或为空目录：${outputRoot}`);
            }
        }
        await mkdir(dirname(outputRoot), {recursive: true});
        await this.assertSameDevice(candidate.path, dirname(outputRoot));
        if (existing) await rm(outputRoot, {recursive: true});
        await rename(candidate.path, outputRoot);
        try {
            return await this.builder.openVerified(outputRoot, identity(candidate));
        } catch (error) {
            await rm(outputRoot, {recursive: true, force: true});
            throw error;
        }
    }

    /** 非受管 Git checkout 可以原子更新本地 `.output`，但不获得安装级 rollback。 */
    private async publishCheckout(candidate: VerifiedProductRuntimeImage): Promise<VerifiedProductRuntimeImage> {
        await this.assertGitCheckout();
        const outputRoot = resolve(this.projectRoot, ".output");
        const publishRoot = resolve(this.projectRoot, ".deploy", "local-publish");
        const previousRoot = resolve(publishRoot, "previous");
        return await this.withCheckoutLease(async () => {
            if (await exists(resolve(this.projectRoot, ".deploy", "installation.json"))) {
                throw new Error("受管 Installation Root 禁止直接更新 `.output`；请使用 NeuroBook Manager rebuild/install/update。");
            }
            await rm(publishRoot, {recursive: true, force: true});
            await mkdir(publishRoot, {recursive: true});
            await this.assertSameDevice(candidate.path, this.projectRoot);
            const current = await lstat(outputRoot).catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null;
                throw error;
            });
            if (current && (!current.isDirectory() || current.isSymbolicLink())) {
                throw new Error(`本地 .output 必须是真实目录：${outputRoot}`);
            }

            let previousMoved = false;
            try {
                if (current) {
                    await rename(outputRoot, previousRoot);
                    previousMoved = true;
                }
                await rename(candidate.path, outputRoot);
                const published = await this.builder.openVerified(outputRoot, identity(candidate));
                await rm(publishRoot, {recursive: true, force: true});
                return published;
            } catch (error) {
                if (await exists(outputRoot)) await rm(outputRoot, {recursive: true, force: true});
                if (previousMoved && await exists(previousRoot)) await rename(previousRoot, outputRoot);
                throw error;
            }
        });
    }

    /** 本地发布与发行读取共用同一排他 lease。 */
    private async withCheckoutLease<T>(operation: () => Promise<T>): Promise<T> {
        const lockTarget = resolve(this.projectRoot, ".deploy", "local-product-publisher");
        await mkdir(resolve(lockTarget, ".."), {recursive: true});
        await writeFile(lockTarget, "", {encoding: "utf8", flag: "a"});
        const release = await acquireFileLock(lockTarget, {
            realpath: false,
            stale: 120_000,
            update: 10_000,
            retries: {retries: 300, factor: 1, minTimeout: 100, maxTimeout: 100},
        });
        try {
            return await operation();
        } finally {
            await release();
        }
    }

    /** 本地 `.output` 事务只允许在 Git checkout 内运行。 */
    private async assertGitCheckout(): Promise<void> {
        if (!await exists(resolve(this.projectRoot, ".git"))) {
            throw new Error("本地 Product 发布只允许 Git checkout；请设置 NEURO_BOOK_OUTPUT_DIR 交给调用方接收 candidate。");
        }
    }

    /** 显式目标可以位于仓库外，但只能是 `.output` 叶子且不能覆盖受管控制目录。 */
    private assertOutputRoot(outputRoot: string): void {
        if (outputRoot === this.projectRoot) throw new Error("NEURO_BOOK_OUTPUT_DIR 不能是 Source Root。");
        if (basename(outputRoot) !== ".output") {
            throw new Error("NEURO_BOOK_OUTPUT_DIR 必须指向名为 `.output` 的独立 Product 目录。" );
        }
        const deployRoot = resolve(this.projectRoot, ".deploy");
        const child = relative(deployRoot, outputRoot);
        if (child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))) {
            throw new Error("NEURO_BOOK_OUTPUT_DIR 不能位于 `.deploy` 内。");
        }
    }

    /** Publisher 只执行原子 rename，不把半复制镜像暴露为 ready。 */
    private async assertSameDevice(candidateRoot: string, outputParent: string): Promise<void> {
        const [candidateInfo, outputInfo] = await Promise.all([stat(candidateRoot), stat(outputParent)]);
        if (candidateInfo.dev !== outputInfo.dev) {
            throw new Error("Product candidate 与输出目录不在同一文件系统，拒绝非原子发布。");
        }
    }
}

/** 从 verified 句柄提取下一次 `openVerified()` 所需的严格身份。 */
function identity(image: VerifiedProductRuntimeImage): ProductRuntimeExpectedIdentity {
    return {
        version: image.manifest.version,
        revision: image.manifest.revision,
        dirty: image.manifest.dirty,
        platform: image.manifest.platform,
        imageId: image.manifest.imageId,
        lockfileSha256: image.manifest.lockfileSha256,
        sourceDigest: image.manifest.sourceDigest,
        builderContractVersion: image.manifest.builderContractVersion,
    };
}

/** 判断路径是否存在；只收窄 ENOENT。 */
async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
    }
}
