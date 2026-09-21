/** 通用文件树节点。业务元数据通过节点 slot 渲染，不进入基础组件合同。 */
export type FileTreeNode = {
    id: string;
    label: string;
    kind: "file" | "directory";
    children?: FileTreeNode[];
    disabled?: boolean;
    iconClass?: string;
};

/** 文件树拖拽后的语义落点。数据变更由消费方提交。 */
export type FileTreeMove = {
    sourceId: string;
    targetId: string | null;
    position: "before" | "after" | "inside" | "root";
};

export type FileTreeVisibleNode = {
    node: FileTreeNode;
    depth: number;
    parentId: string | null;
};
