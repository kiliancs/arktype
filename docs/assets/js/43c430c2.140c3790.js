"use strict";(self.webpackChunk_re_docs=self.webpackChunk_re_docs||[]).push([[747],{7616:(e,t,r)=>{r.d(t,{Zo:()=>p,kt:()=>f});var n=r(1672);function o(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function i(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),r.push.apply(r,n)}return r}function a(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?i(Object(r),!0).forEach((function(t){o(e,t,r[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):i(Object(r)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))}))}return e}function l(e,t){if(null==e)return{};var r,n,o=function(e,t){if(null==e)return{};var r,n,o={},i=Object.keys(e);for(n=0;n<i.length;n++)r=i[n],t.indexOf(r)>=0||(o[r]=e[r]);return o}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(n=0;n<i.length;n++)r=i[n],t.indexOf(r)>=0||Object.prototype.propertyIsEnumerable.call(e,r)&&(o[r]=e[r])}return o}var s=n.createContext({}),c=function(e){var t=n.useContext(s),r=t;return e&&(r="function"==typeof e?e(t):a(a({},t),e)),r},p=function(e){var t=c(e.components);return n.createElement(s.Provider,{value:t},e.children)},d={inlineCode:"code",wrapper:function(e){var t=e.children;return n.createElement(n.Fragment,{},t)}},u=n.forwardRef((function(e,t){var r=e.components,o=e.mdxType,i=e.originalType,s=e.parentName,p=l(e,["components","mdxType","originalType","parentName"]),u=c(r),f=o,m=u["".concat(s,".").concat(f)]||u[f]||d[f]||i;return r?n.createElement(m,a(a({ref:t},p),{},{components:r})):n.createElement(m,a({ref:t},p))}));function f(e,t){var r=arguments,o=t&&t.mdxType;if("string"==typeof e||o){var i=r.length,a=new Array(i);a[0]=u;var l={};for(var s in t)hasOwnProperty.call(t,s)&&(l[s]=t[s]);l.originalType=e,l.mdxType="string"==typeof e?e:o,a[1]=l;for(var c=2;c<i;c++)a[c]=r[c];return n.createElement.apply(null,a)}return n.createElement.apply(null,r)}u.displayName="MDXCreateElement"},1856:(e,t,r)=>{r.r(t),r.d(t,{assets:()=>y,contentTitle:()=>f,default:()=>g,frontMatter:()=>u,metadata:()=>m,toc:()=>b});var n=r(7616),o=Object.defineProperty,i=Object.defineProperties,a=Object.getOwnPropertyDescriptors,l=Object.getOwnPropertySymbols,s=Object.prototype.hasOwnProperty,c=Object.prototype.propertyIsEnumerable,p=(e,t,r)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,d=(e,t)=>{for(var r in t||(t={}))s.call(t,r)&&p(e,r,t[r]);if(l)for(var r of l(t))c.call(t,r)&&p(e,r,t[r]);return e};const u={sidebar_position:3,hide_table_of_contents:!0},f="Declarations",m={unversionedId:"model/declarations",id:"model/declarations",title:"Declarations",description:"Like keeping your files small and tidy? Perhaps you'd prefer to split your definitions up.",source:"@site/docs/model/declarations.mdx",sourceDirName:"model",slug:"/model/declarations",permalink:"/docs/model/declarations",editUrl:"https://github.com/re-do/re-po/edit/main/pkgs/docs/docs/model/declarations.mdx",tags:[],version:"current",sidebarPosition:3,frontMatter:{sidebar_position:3,hide_table_of_contents:!0},sidebar:"model",previous:{title:"Spaces",permalink:"/docs/model/spaces"},next:{title:"Constraints",permalink:"/docs/model/constraints"}},y={},b=[],O={toc:b};function g(e){var t,r=e,{components:o}=r,p=((e,t)=>{var r={};for(var n in e)s.call(e,n)&&t.indexOf(n)<0&&(r[n]=e[n]);if(null!=e&&l)for(var n of l(e))t.indexOf(n)<0&&c.call(e,n)&&(r[n]=e[n]);return r})(r,["components"]);return(0,n.kt)("wrapper",(t=d(d({},O),p),i(t,a({components:o,mdxType:"MDXLayout"}))),(0,n.kt)("h1",d({},{id:"declarations"}),"Declarations"),(0,n.kt)("p",null,"Like keeping your files small and tidy? Perhaps you'd prefer to split your definitions up."),(0,n.kt)("p",null,"Try a ",(0,n.kt)("strong",{parentName:"p"},"declaration"),"."),(0,n.kt)("div",{style:{width:"100%",height:"730px",border:0,marginLeft:-8,marginRight:-8,padding:16,overflow:"hidden",borderRadius:8}},(0,n.kt)("iframe",{id:"demo",src:"https://stackblitz.com/edit/re-model-declaration?file=models%2Findex.ts&hideDevTools=1&hideExplorer=1&hideNavigation=1&theme=dark",style:{height:"100%",width:"100%",borderRadius:8},title:"@re-/model",sandbox:"allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"})))}g.isMDXComponent=!0}}]);