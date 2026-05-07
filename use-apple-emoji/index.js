(function(e,n){"use strict";let t=null,o=null,s=!1;function l(){if(t=n.findByProps("updateRows","clearRows"),!t){alert("rowMod null");return}o=t.updateRows,t.updateRows=function(r,...u){if(!s){s=!0;try{const a=Array.isArray(r)?r[0]:r;alert(`updateRows chamado!
rows type: `+typeof r+`
isArray: `+Array.isArray(r)+`
sample keys: `+Object.keys(a??{}).join(", ")+`
sample.type: `+a?.type+`
sample JSON: `+JSON.stringify(a)?.slice(0,300))}catch(a){alert("erro ao logar: "+a?.message)}}return o.apply(this,[r,...u])}}l();const i=function(){t&&o&&(t.updateRows=o)};return e.onUnload=i,e})({},vendetta.metro);
