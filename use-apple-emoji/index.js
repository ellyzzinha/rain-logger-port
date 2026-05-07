(function(e,r,a){"use strict";let i=!1,t=null,o=null;function m(){if(o=r.findByProps("Emoji","asUnicodeEmoji"),!o?.Emoji){alert("emojiMod null");return}t=o.Emoji,o.Emoji=function(n){if(!i){i=!0;const s=n?.emoji?.surrogates??n?.node?.surrogate??n?.surrogates??"N/A";alert(`Emoji chamado!
props keys: `+Object.keys(n??{}).join(", ")+`
surrogate: `+s+`
Image: `+(a.ReactNative?.Image?"OK":"NULL"))}return t(n)}}m();const u=function(){o&&t&&(o.Emoji=t)};return e.onUnload=u,e})({},vendetta.metro,vendetta.metro.common);
