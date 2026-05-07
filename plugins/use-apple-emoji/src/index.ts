import { findByProps } from "@vendetta/metro";

let rowMod: any = null;
let origUpdateRows: any = null;
let logged = false;

function init() {
    rowMod = findByProps("updateRows", "clearRows");
    if (!rowMod) { alert("rowMod null"); return; }

    origUpdateRows = rowMod.updateRows;

    rowMod.updateRows = function(rows: any, ...rest: any[]) {
        if (!logged) {
            logged = true;
            try {
                const sample = Array.isArray(rows) ? rows[0] : rows;
                alert(
                    "updateRows chamado!\n" +
                    "rows type: " + typeof rows + "\n" +
                    "isArray: " + Array.isArray(rows) + "\n" +
                    "sample keys: " + Object.keys(sample ?? {}).join(", ") + "\n" +
                    "sample.type: " + sample?.type + "\n" +
                    "sample JSON: " + JSON.stringify(sample)?.slice(0, 300)
                );
            } catch(e: any) {
                alert("erro ao logar: " + e?.message);
            }
        }
        return origUpdateRows.apply(this, [rows, ...rest]);
    };
}

init();

export const onUnload = () => {
    if (rowMod && origUpdateRows) rowMod.updateRows = origUpdateRows;
};
