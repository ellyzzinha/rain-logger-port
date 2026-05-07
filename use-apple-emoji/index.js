(function(n,s,i,c){"use strict";const e=[];let a=!1;function u(){const t=i.findByProps("Emoji","asUnicodeEmoji");if(!t){alert("emojiMod null");return}e.push(s.patcher.instead(t,"Emoji",function(r,d){const o=r[0];if(!a){a=!0;const f=o?.emoji?.surrogates??o?.node?.surrogate??o?.surrogates??"N/A",l=c.ReactNative?.Image;alert(`Emoji chamado!
props keys: `+Object.keys(o??{}).join(", ")+`
surrogate: `+f+`
ReactNative.Image: `+(l?"OK":"NULL"))}return d.apply(this,r)}))}u();const m=function(){for(const t of e)t();e.length=0};return n.onUnload=m,n})({},vendetta,vendetta.metro,vendetta.metro.common);
