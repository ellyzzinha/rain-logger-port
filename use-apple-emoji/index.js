(function(r,u){"use strict";let e=null,n=null;function a(){const i=u.findByProps("defaultRules","createReactRules");if(!i?.defaultRules){alert("parseMod n\xE3o encontrado");return}const t=i.defaultRules;if(!t.emoji){alert("rules.emoji n\xE3o existe");return}n=t.emoji,e=t.emoji.react;let l=!1;t.emoji.react=function(o,s,d){return l||(l=!0,alert(`emoji node keys:
`+Object.keys(o??{}).join(", ")+`

node JSON:
`+JSON.stringify(o)?.slice(0,300))),e(o,s,d)}}a();const c=function(){n&&e&&(n.react=e)};return r.onUnload=c,r})({},vendetta.metro);
