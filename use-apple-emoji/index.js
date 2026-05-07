(function(t,l){"use strict";const n=[];function s(){const e=l.findByProps("defaultRules","createReactRules");if(!e){alert("parseMod n\xE3o encontrado");return}const o=e.defaultRules;if(!o){alert(`defaultRules null
keys: `+Object.keys(e).join(", "));return}alert(`defaultRules keys:
`+Object.keys(o).join(", "))}s();const u=function(){for(const e of n)e();n.length=0};return t.onUnload=u,t})({},vendetta.metro);
