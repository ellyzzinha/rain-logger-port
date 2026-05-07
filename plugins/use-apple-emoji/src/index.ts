import { findByProps } from "@vendetta/metro";

let rowMod: any = null;
let origUpdateRows: any = null;
let logged = false;

function init() {
    rowMod = findByProps("updateRows", "clearRows");
    if (!rowMod) { alert("rowMod null"); return; }

    origUpdateRows = rowMod.updateRows;

    rowMod.updateRows = function(rows: any, ...rest: any[]) {
        if (!logged && Array.isArray(rows) && rows.length > 0) {
            logged = true;
            const row = rows[0];
            const rowKeys = Object.keys(row ?? {}).join(", ");
            const msg = row?.message;
            const msgKeys = Object.keys(msg ?? {}).join(", ");
            const content = msg?.content;
            const firstNode = Array.isArray(content) ? content[0] : null;
            const nodeKeys = Object.keys(firstNode ?? {}).join(", ");
            alert(
                "row.type: " + row?.type + "\n" +
                "row keys: " + rowKeys + "\n\n" +
                "message keys: " + msgKeys + "\n\n" +
                "content[0] keys: " + nodeKeys + "\n" +
                "content[0].type: " + firstNode?.type + "\n" +
                "content[0].surrogate: " + firstNode?.surrogate + "\n" +
                "content[0].content: " + firstNode?.content
            );
        }
        return origUpdateRows.apply(this, [rows, ...rest]);
    };
}

init();

export const onUnload = () => {
    if (rowMod && origUpdateRows) rowMod.updateRows = origUpdateRows;
};
