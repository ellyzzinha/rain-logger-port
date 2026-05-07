(function(s,y){"use strict";let t=null,e=null,a=!1;function l(){if(t=y.findByProps("updateRows","clearRows"),!t){alert("rowMod null");return}e=t.updateRows,t.updateRows=function(n,...d){if(!a&&Array.isArray(n)&&n.length>0){a=!0;const r=n[0],p=Object.keys(r??{}).join(", "),c=r?.message,w=Object.keys(c??{}).join(", "),u=c?.content,o=Array.isArray(u)?u[0]:null,f=Object.keys(o??{}).join(", ");alert("row.type: "+r?.type+`
row keys: `+p+`

message keys: `+w+`

content[0] keys: `+f+`
content[0].type: `+o?.type+`
content[0].surrogate: `+o?.surrogate+`
content[0].content: `+o?.content)}return e.apply(this,[n,...d])}}l();const i=function(){t&&e&&(t.updateRows=e)};return s.onUnload=i,s})({},vendetta.metro);
