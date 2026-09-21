/**
 * Re-export from server/openapi/route-map.ts for backwards compatibility.
 *
 * The canonical route map now lives in server/openapi/ so it's importable
 * both at runtime (by the `/_openapi.json` endpoint) and at build time
 * (by `generate-openapi-meta.ts`).
 */

export {
    routeMetaMap,
    type RouteMetaEntry,
} from "../server/openapi/route-map";
