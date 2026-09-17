import {getDailyEntry} from './glossary-daily.mjs';
const STORAGE_KEY='4dvip.glossary.daily.v1';
export function normalizeSearch(value){return String(value).normalize('NFKC').toLocaleLowerCase('en').trim();}
export function matchingEntries(entries,query){
  const term=normalizeSearch(query);
  return entries.filter(entry=>{
    if(!term)return true;
    if(/^\d{1,4}$/.test(term))return (entry.count&&term.includes(entry.count))||entry.code===term;
    return normalizeSearch(entry.text+' '+(entry.keywords||'')).includes(term);
  });
}
export function millisecondsToMalaysiaMidnight(now=new Date()){
  const shifted=now.getTime()+8*60*60*1000;
  return Math.max(1000,(Math.floor(shifted/86400000)+1)*86400000-shifted+100);
}
function start(){
  const articles=[...document.querySelectorAll('[data-glossary-entry]')];
  if(!articles.length)return;
  const entries=articles.map(article=>({id:article.id,text:article.textContent,keywords:article.dataset.keywords,count:article.dataset.count,code:article.dataset.code,source:article.dataset.source,node:article}));
  for(const entry of entries){
    const badge=document.createElement('span');
    badge.className='entry-code';
    badge.textContent=entry.code;
    badge.title='Four-digit browsing code for this documented motif count';
    entry.node.querySelector('.entry-heading').append(badge);
    const art=document.createElement('div');
    art.className='entry-art';
    art.setAttribute('aria-hidden','true');
    art.textContent=entry.node.dataset.mark;
    entry.node.querySelector('.entry-heading').after(art);
  }
  const catalog=new Map(entries.map(entry=>[entry.id,entry]));
  const date=document.getElementById('daily-date'),status=document.getElementById('daily-status');
  const card=document.getElementById('daily-card'),form=document.getElementById('glossary-search');
  const dailyTitle=document.getElementById('daily-title');
  let midnightTimer;
  function refreshDaily(){
    clearTimeout(midnightTimer);
    let storage;
    try{storage=window.localStorage;}catch{storage=undefined;}
    try{
      const selection=getDailyEntry({entryIds:entries.map(entry=>entry.id),now:new Date(),storage});
      const entry=catalog.get(selection.entryId),node=entry.node;
      document.getElementById('daily-glyph').textContent=node.querySelector('.entry-glyph').textContent;
      document.getElementById('daily-code').textContent=entry.code;
      dailyTitle.textContent=node.querySelector('h3').textContent;
      document.getElementById('daily-title-zh').textContent=node.querySelector('.entry-title-zh').textContent;
      document.getElementById('daily-copy').textContent=node.querySelector('.entry-copy').textContent;
      document.getElementById('daily-copy-zh').textContent=node.querySelector('.entry-copy-zh').textContent;
      document.getElementById('daily-read').href='#'+entry.id;
      card.dataset.entryId=entry.id;
      date.dateTime=selection.day;
      date.textContent=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(selection.day+'T12:00:00Z'))+' · MYT';
      status.textContent=selection.persisted?'Saved on this browser for today. Changes after midnight in Malaysia.':'Browser storage is unavailable. This reading stays while this page is open, but may change after a reload.';
      card.hidden=false;
    }catch{
      card.hidden=true;date.textContent='Daily reading unavailable';
      status.textContent='The daily selection could not be prepared. You can still read the complete glossary below.';
    }
    midnightTimer=setTimeout(refreshDaily,millisecondsToMalaysiaMidnight());
  }
  const search=document.getElementById('glossary-query'),searchStatus=document.getElementById('search-status'),empty=document.getElementById('empty-state');
  const sources=[...document.querySelectorAll('.source-filter')];
  const graphics=document.getElementById('show-graphics');
  function filter(){
    const allowed=new Set(sources.filter(input=>input.checked).map(input=>input.value));
    const matched=new Set(matchingEntries(entries,search.value).filter(entry=>allowed.has(entry.source)).map(entry=>entry.id));
    for(const entry of entries)entry.node.hidden=!matched.has(entry.id);
    empty.hidden=matched.size!==0;
    const numeric=/^\d{4}$/.test(search.value.trim());
    const prefix=numeric?'Digit associations found within '+search.value.trim()+': ':'Showing ';
    searchStatus.textContent=matched.size?prefix+matched.size+' of '+entries.length+' sourced entries.':'No matching entries. Try another scene, number or source filter.';
  }
  form.hidden=false;
  document.getElementById('lookup-options').hidden=false;
  form.addEventListener('submit',event=>{event.preventDefault();filter();});
  search.addEventListener('input',filter);
  form.addEventListener('reset',event=>{event.preventDefault();search.value='';filter();search.focus();});
  sources.forEach(input=>input.addEventListener('change',filter));
  graphics.addEventListener('change',()=>{document.body.classList.toggle('no-graphics',!graphics.checked);});
  document.getElementById('daily-read').addEventListener('click',()=>{search.value='';filter();});
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)refreshDaily();});
  window.addEventListener('pageshow',refreshDaily);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDaily();});
  refreshDaily();filter();
}
if(typeof document!=='undefined')start();
