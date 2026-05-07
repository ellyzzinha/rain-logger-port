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
            const rows = args[0];
            alert(
                "args.length: " + args.length + "\n" +
                "rows type: " + typeof rows + "\n" +
                "isArray: " + Array.isArray(rows) + "\n" +
                "rows length: " + (Array.isArray(rows) ? rows.length : "N/A") + "\n" +
                "keys: " + Object.keys(rows ?? {}).slice(0, 10).join(", ")
            );
        }
        return origUpdateRows.apply(this, args);
    };
}

init();

export const onUnload = () => {
    if (rowMod && origUpdateRows) rowMod.updateRows = origUpdateRows;
};
