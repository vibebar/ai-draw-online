import {CHARACTERS,portraitPage} from './characters.mjs';

export function renderCharacterCards(cards,showPortrait){
  for(const character of CHARACTERS){
    const card=document.createElement('article');
    card.innerHTML='<header></header><img>';
    const header=card.querySelector('header');
    const heading=document.createElement(showPortrait?'h3':'h2');
    heading.textContent=character.name;
    header.append(heading);
    if(showPortrait){
      const button=document.createElement('button');
      button.type='button';
      button.className='quiet';
      button.textContent='查看完整立绘';
      button.setAttribute('aria-haspopup','dialog');
      button.addEventListener('click',()=>showPortrait(character));
      header.append(button);
    }else{
      const link=document.createElement('a');
      link.href=portraitPage(character.id);
      link.textContent='查看完整立绘 ↗';
      header.append(link);
    }
    const img=card.querySelector('img');
    img.loading='lazy';
    img.src=character.imageUrl;
    img.alt=character.name+' 的角色立绘';
    cards.append(card);
  }
}

const standaloneCards=document.getElementById('cards');
if(standaloneCards)renderCharacterCards(standaloneCards);
