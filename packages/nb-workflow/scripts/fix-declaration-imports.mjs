import {
    readFileSync,
    readdirSync,
    writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
verifyRewriteContract();
const declarationFiles = walk(root)
    .filter((path) => path.endsWith(".d.ts"));

for (const file of declarationFiles) {
    const source = readFileSync(file, "utf8");
    const rewritten = rewriteDeclarationImports(source);
    writeFileSync(file, rewritten, "utf8");
}

function rewriteDeclarationImports(source) {
    const references = ts.preProcessFile(
        source,
        true,
        true,
    ).importedFiles;
    let output = source;
    const edits = references.map((reference) => {
        const specifier = reference.fileName;
        const start = reference.pos + 1;
        const end = start + specifier.length;
        if (
            source.slice(start, end) !== specifier
            || !["\"", "'"].includes(source[reference.pos] ?? "")
            || source[end] !== source[reference.pos]
        ) {
            throw new Error(
                `Cannot locate declaration import ${specifier}.`,
            );
        }
        return { end, specifier };
    });
    for (const { end, specifier } of edits.sort(
        (left, right) => right.end - left.end,
    )) {
        if (
            !specifier.startsWith("./")
            && !specifier.startsWith("../")
        ) {
            continue;
        }
        if (extname(specifier)) {
            continue;
        }
        output = output.slice(0, end)
            + ".js"
            + output.slice(end);
    }
    return output;
}

function verifyRewriteContract() {
    const source = "export * from \"./module\";\n"
        + "type Literal = \"./leave-unchanged\";\n";
    const expected = "export * from \"./module.js\";\n"
        + "type Literal = \"./leave-unchanged\";\n";
    const rewritten = rewriteDeclarationImports(source);
    if (
        rewritten !== expected
        || rewriteDeclarationImports(rewritten) !== expected
    ) {
        throw new Error(
            "Declaration import rewriting contract failed.",
        );
    }
}

function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });
}
