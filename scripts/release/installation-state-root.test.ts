import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {resolveReleaseStateRoot} from "#scripts/release/installation-state-root";

describe("Release GHCR State Root", () => {
    it("从Installation Manifest locator解析State Root", () => {
        expect(resolveReleaseStateRoot("/tmp/neuro-book", {
            roots: {state: {base: "installation-root", path: "data"}},
        })).toBe(resolve("/tmp/neuro-book", "data"));
    });

    it.each([
        {roots: {state: {base: "local-app-data", path: "NeuroBook/data"}}},
        {roots: {state: {base: "installation-root", path: "../outside"}}},
        {roots: {state: {base: "installation-root", path: "."}}},
        {roots: {}},
    ])("拒绝公开GHCR smoke不能安全解析的locator：$roots", (manifest) => {
        expect(() => resolveReleaseStateRoot("/tmp/neuro-book", manifest)).toThrow("State Root locator");
    });
});
