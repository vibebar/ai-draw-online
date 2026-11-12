import {CHARACTERS,portraitPage} from './characters.mjs';

const cards=document.getElementById('cards');
for(const character of CHARACTERS){
  const card=document.createElement('article');
  card.innerHTML='<header><h2></h2><a>查看完整立绘 ↗</a></header><img>';
  card.querySelector('h2').textContent=character.name;
  card.querySelector('a').href=portraitPage(character.id);
  const img=card.querySelector('img');
  img.src=character.imageUrl;
  img.alt=character.name+' 的角色立绘';
  img.loading='lazy';
  cards.append(card);
}
