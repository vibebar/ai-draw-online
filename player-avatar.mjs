import {seatCharacter} from './seat-presentation.mjs';

const GHOST='<svg viewBox="28 24 150 150" aria-hidden="true"><path class="ghost-body" fill-rule="evenodd" d="M34.2 91.2h9V81.1h9.3V71H68v-9.9h34.7V71H118v9.4h8.3v11.5h9.2V143h-8.2v12.8h-19.8V143H94.4v12.8H74.8V143H61.9v12.8H42.3v-12h-8.1zM71.8 100.3v13.6h13.1v-13.6zM105 100.3v13.6h13.1v-13.6z"/><path class="ghost-prop" d="M154 49h17v8h5v19h-7v11h-8v12h-7v12h-6v12h-7v13h-12v-19h7v-12h6V93h7V79h-5V63h5V55h5z"/><path class="ghost-detail" d="M149 78h20v9h-8v4h-12z"/></svg>';

export function createPlayerAvatar(player){
  const avatar=document.createElement('span');
  avatar.className='player-avatar';
  if(!player)return avatar;
  avatar.title=player.name;
  const character=seatCharacter(player);
  if(character){
    const img=document.createElement('img');
    img.src=character.avatarUrl;
    img.alt=player.name;
    avatar.append(img);
  }else avatar.innerHTML=GHOST;
  return avatar;
}
