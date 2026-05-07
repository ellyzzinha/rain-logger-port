import { findByProps } from "@vendetta/metro";

let rowMod: any = null;
let origUpdateRows: any = null;
let logged = false;

function init() {
    rowMod = findByProps("updateRows", "clearRows");
    if (!rowMod) { alert("rowMod null"); return; }

    origUpdateRows = rowMod.updateRows;

    rowMod.updateRows = function(...args: any[]) {
        if (!logged) {
            logged = true;
            const rows = args[1]; // segundo argumento
            const isArr = Array.isArray(rows);
            const first = isArr ? rows[0] : null;
            const firstKeys = Object.keys(first ?? {}).join(", ");
            const msg = first?.message;
            const content = msg?.content;
            const node = Array.isArray(content) ? content[0] : null;
            alert(
                "args[1] isArray: " + isArr + "\n" +
                "length: " + (isArr ? rows.length : "N/A") + "\n" +
                "first keys: " + firstKeys + "\n" +
                "first.type: " + first?.type + "\n" +
                "node.type: " + node?.type + "\n" +
                "node.surrogate: " + node?.surrogate
            );
        }
        return origUpdateRows.apply(this, args);
    };
}

init();

export const onUnload = () => {
    if (rowMod && origUpdateRows) rowMod.updateRows = origUpdateRows;
};
