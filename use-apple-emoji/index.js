(function(t,r){"use strict";const i=[];function s(){const n=r.findByProps("Emoji","asUnicodeEmoji");if(!n){alert("emojiMod NULL");return}const u=Object.keys(n).map(function(e){const o=n[e],c=typeof o,a=c==="function"?` | body: ${o.toString().slice(0,100)}`:` | val: ${JSON.stringify(o)?.slice(0,60)}`;return`${e} [${c}]${a}`}).join(`

`);alert(`emojiMod:

`+u)}s();const f=function(){for(const n of i)n();i.length=0};return t.onUnload=f,t})({},vendetta.metro);
