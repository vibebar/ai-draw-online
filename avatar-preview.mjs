import {CHARACTERS,CHARACTER_MAP,portraitPage} from './characters.mjs';

const selector=document.getElementById('characterSelect');
const img=document.getElementById('portrait');
const status=document.getElementById('loadStatus');
const name=document.getElementById('characterName');

for(const character of CHARACTERS){
  selector.add(new Option(character.name,character.id));
}

function showPortrait(id){
  const character=Object.hasOwn(CHARACTER_MAP,id)?CHARACTER_MAP[id]:CHARACTER_MAP.deepseek;
  selector.value=character.id;
  document.title=character.name+' · 角色立绘';
  name.textContent=character.name;
  status.textContent='图片加载中…';
  img.alt=character.name+' 的完整立绘';
  img.src=character.imageUrl;
  history.replaceState(null,'',portraitPage(character.id));
}

img.onload=()=>{status.textContent='';};
img.onerror=()=>{status.textContent='图片加载失败，请刷新重试。';};
selector.onchange=()=>showPortrait(selector.value);
showPortrait(new URLSearchParams(location.search).get('character'));
