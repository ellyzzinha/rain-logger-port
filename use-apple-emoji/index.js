(function(n,s){"use strict";let e=null;function r(){if(e=s.findByProps("defaultRules","createReactRules"),!e){alert("parseMod null");return}const o=Object.keys(e).join(", "),a=typeof e.createReactRules=="function";let l=!1,c="";if(a)try{const t=e.createReactRules();l=t===e.defaultRules,c=Object.keys(t??{}).slice(0,6).join(", ")}catch(t){c="erro: "+t?.message}alert("parseMod keys: "+o+`

createReactRules \xE9 fun\xE7\xE3o: `+a+`
created === defaultRules: `+l+`
created keys: `+c)}r();const u=function(){};return n.onUnload=u,n})({},vendetta.metro);
