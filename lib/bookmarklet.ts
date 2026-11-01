/**
 * Code du favori « Envoyer à JobPilot ».
 * 1. Envoie la page (texte, liens) à JobPilot, qui s'ouvre dans un nouvel onglet.
 * 2. Reste à l'écoute de JobPilot : pour une liste de résultats, JobPilot demande à lire chaque annonce
 *    avec la session ouverte de la personne. Le favori ne répond qu'à l'onglet JobPilot qu'il a ouvert, et ne lit
 *    que des pages du même site que celui où la personne se trouve. Jamais LinkedIn, pour ne pas risquer son compte.
 */
const SOURCE = String.raw`
(function(){
var A='__APP__',
s=String(window.getSelection?window.getSelection():''),
d=document.querySelector('.jobs-description__content,.jobs-box__html-content,#jobDescriptionText,.jobsearch-JobComponent-description,[data-testid="job-description"],.description__text'),
one=s.length>=150?s:(d?d.innerText:''),
m=document.querySelector('main')||document.body,
L=[].slice.call(m.querySelectorAll('a[href]')).map(function(a){return{t:(a.innerText||'').replace(/\s+/g,' ').trim().slice(0,160),h:a.href}}).filter(function(x){return x.t.length>7&&/^https?:/.test(x.h)}).slice(0,150),
P={jp:1,url:location.href,title:document.title,one:one.slice(0,30000),page:(m.innerText||'').slice(0,30000),links:L},
w=window.open(A+'/importer','_blank'),n=0,
iv=setInterval(function(){if(!w||w.closed||++n>80){clearInterval(iv);return}try{w.postMessage(P,A)}catch(e){}},400);
function R(o){try{w.postMessage(o,A)}catch(e){}}
function H(x){var q=new DOMParser().parseFromString('<body>'+x,'text/html').body.textContent||'';return /<\/?(p|br|li|ul|div|strong|b)\b/i.test(q)?new DOMParser().parseFromString('<body>'+q,'text/html').body.textContent||'':q}
function T(h){
var o=new DOMParser().parseFromString(h,'text/html'),t='';
[].slice.call(o.querySelectorAll('script[type="application/ld+json"]')).forEach(function(x){
try{var j=JSON.parse(x.textContent);[].concat(j,j&&j['@graph']||[]).forEach(function(p){if(p&&/JobPosting/.test(p['@type']))t+=(p.title||'')+'\n'+((p.hiringOrganization||{}).name||'')+'\n'+H(p.description||'')+'\n'})}catch(e){}});
if(t.length<300){[].slice.call(o.querySelectorAll('script,style,nav,header,footer,noscript,svg')).forEach(function(x){x.remove()});t=(o.querySelector('main')||o.body||{}).textContent||''}
return t.replace(/[ \t ]+/g,' ').replace(/\s*\n\s*/g,'\n').trim().slice(0,12000)}
window.addEventListener('message',function(e){
if(e.origin!==A||e.source!==w)return;
var g=e.data;
if(g==='jp-ok'){clearInterval(iv);return}
if(g&&g.jp==='get'&&typeof g.u==='string'){
var u;try{u=new URL(g.u,location.href)}catch(x){return R({jp:'got',i:g.i,ok:0})}
if(u.origin!==location.origin||/linkedin\.com$/.test(u.hostname))return R({jp:'got',i:g.i,ok:0,why:'site'});
fetch(u.href,{credentials:'include'}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(h){R({jp:'got',i:g.i,ok:1,t:T(h)})}).catch(function(){R({jp:'got',i:g.i,ok:0})})}
})
})();
`;

/** Une seule ligne, prête à être posée dans l'adresse d'un favori. */
export function bookmarkletCode(app: string): string {
  const oneLine = SOURCE.trim().split("\n").map((l) => l.trim()).join("");
  return "javascript:" + oneLine.replace("__APP__", app.replace(/'/g, ""));
}
