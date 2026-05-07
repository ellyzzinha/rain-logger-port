import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/";

function toPath(surrogate: string): string | null {
    if (!surrogate) return null;
    const pts: string[] = [];
    for (let i = 0; i < surrogate.length;) {
        const cp = surrogate.codePointAt(i);
        if (cp === undefined) break;
        if (cp !== 0xfe0f) pts.push(cp.toString(16));
        i += cp > 0xffff ? 2 : 1;
    }
    return pts.length ? pts.join("-") + ".png" : null;
}

function appleNode(surrogate: string, jumboable: boolean) {
    const path = toPath(surrogate);
    if (!path) return null;
    const size = jumboable ? 48 : 22;
    return {
        type: "image" as any,
        target: CDN + path,
        width: size,
        height: size,
        alt: surrogate,
    };
}

function iterate(rows: any[]): any[] {
    const out: any[] = [];
    for (const row of rows) {
        if (row.type === "emoji" && row.surrogate) {
            const node = appleNode(row.surrogate, row.jumboable ?? false);
            out.push(node ?? row);
        } else {
            const r = { ...row };
            if (Array.isArray(r.content)) r.content = iterate(r.content);
            if (Array.isArray(r.items)) r.items = iterate(r.items);
            out.push(r);
        }
    }
    return out;
}

let rowMod: any = null;
let origUpdateRows: any = null;

function init() {
    rowMod = findByProps("updateRows", "clearRows");
    if (!rowMod) { alert("rowMod null"); return; }

    origUpdateRows = rowMod.updateRows;

    rowMod.updateRows = function(rows: any[], ...rest: any[]) {
        if (Array.isArray(rows)) {
            for (const row of rows) {
                if (row.type === 1 && Array.isArray(row.message?.content)) {
                    row.message.content = iterate(row.message.content);
                }
            }
        }
        return origUpdateRows.apply(this, [rows, ...rest]);
    };
}

init();

export const onUnload = () => {
    if (rowMod && origUpdateRows) {
        rowMod.updateRows = origUpdateRows;
    }
};
