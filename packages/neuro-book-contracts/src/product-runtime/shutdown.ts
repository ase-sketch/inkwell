import {
    PRODUCT_RUNTIME_EXIT_CODE_AGENT_SESSION_STORE_LEASE_COMPROMISED,
    PRODUCT_SHUTDOWN_PATH,
    PRODUCT_SHUTDOWN_TIMEOUT_MS,
    PRODUCT_SHUTDOWN_TOKEN_ENVIRONMENT,
} from "./contract";

export {
    PRODUCT_RUNTIME_EXIT_CODE_AGENT_SESSION_STORE_LEASE_COMPROMISED,
    PRODUCT_SHUTDOWN_PATH,
    PRODUCT_SHUTDOWN_TIMEOUT_MS,
    PRODUCT_SHUTDOWN_TOKEN_ENVIRONMENT,
};

export type NativeProductExit = {
    code: number | null;
    signal: string | null;
};

export type NativeProductShutdownResult = "graceful" | "forced";
