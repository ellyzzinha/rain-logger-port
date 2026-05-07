(function(a,y){"use strict";let t=null,n=null,s=!1;function d(){if(t=y.findByProps("updateRows","clearRows"),!t){alert("rowMod null");return}n=t.updateRows,t.updateRows=function(...l){if(!s){s=!0;const e=l[1],r=Array.isArray(e),o=r?e[0]:null,c=Object.keys(o??{}).join(", "),u=o?.message?.content,i=Array.isArray(u)?u[0]:null;alert("args[1] isArray: "+r+`
length: `+(r?e.length:"N/A")+`
first keys: `+c+`
first.type: `+o?.type+`
node.type: `+i?.type+`
node.surrogate: `+i?.surrogate)}return n.apply(this,l)}}d();const p=function(){t&&n&&(t.updateRows=n)};return a.onUnload=p,a})({},vendetta.metro);
