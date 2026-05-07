(function(r,l){"use strict";let t=null,e=null,s=!1;function a(){if(t=l.findByProps("updateRows","clearRows"),!t){alert("rowMod null");return}e=t.updateRows,t.updateRows=function(...o){if(!s){s=!0;const n=o[0];alert("args.length: "+o.length+`
rows type: `+typeof n+`
isArray: `+Array.isArray(n)+`
rows length: `+(Array.isArray(n)?n.length:"N/A")+`
keys: `+Object.keys(n??{}).slice(0,10).join(", "))}return e.apply(this,o)}}a();const u=function(){t&&e&&(t.updateRows=e)};return r.onUnload=u,r})({},vendetta.metro);
