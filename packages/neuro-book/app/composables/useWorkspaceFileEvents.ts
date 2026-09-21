import {readSseStream} from "nbook/app/utils/http/read-sse";
import type {WorkspaceFileStreamEventDto} from "nbook/shared/dto/workspace-file-events.dto";

type WorkspaceFileEventHandler = (event: WorkspaceFileStreamEventDto) => void;
type WorkspaceFileEventTarget = {projectRoot: string} | {workspaceKind: "user-assets"};

/**
 * 订阅当前小说 workspace 的文件变化事件。
 */
export function useWorkspaceFileEvents() {
    const subscribe = async (
        target: WorkspaceFileEventTarget,
        onEvent: WorkspaceFileEventHandler,
        signal?: AbortSignal,
    ): Promise<void> => {
        const searchParams = new URLSearchParams(target);
        const response = await fetch(`/api/workspace-files/events?${searchParams.toString()}`, {
            method: "GET",
            signal,
        });

        await readSseStream<WorkspaceFileStreamEventDto>(response, onEvent);
    };

    return {
        subscribe,
    };
}
