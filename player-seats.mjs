
import {seatCharacter,seatPresentation,tablePlaces} from './seat-presentation.mjs';
import {latestSpeech,messageBody,messageLabel} from './conversation.mjs';
import {playerModelLabel,playerLabel} from './characters.mjs';


const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createPlayerSeats(container,{onPreparation=()=>{}}={}){
  const seats=new Map();let gameId=null,prepared=[],active=false;
  // Keep portrait cards connected and sized while the lobby is visible.
  const parking=document.createElement('div');parking.className='seat-preload-parking';parking.setAttribute('aria-hidden','true');parking.inert=true;document.body.append(parking);
  function report(){const chosen=prepared.map(p=>seats.get(p.id)).filter(Boolean);onPreparation({total:prepared.length,ready:chosen.filter(s=>s.status==='ready').length,failed:chosen.filter(s=>s.status==='error').length});}
  function remove(id){const seat=seats.get(id);seat.card.remove();seats.delete(id);}
  function clear(){for(const id of seats.keys())remove(id);gameId=null;parking.remove();}
  function mount(player,character,home){
    const card=document.createElement('article');
    card.className=player.human?'player-seat human-seat':'player-seat ai-seat';card.dataset.playerId=player.id;
    card.innerHTML='<header><div class="seat-identity"><strong class="seat-name"></strong><small class="seat-model"></small></div><span class="seat-score"></span></header><div class="seat-stage"></div><div class="seat-dialogue" hidden></div><div class="seat-caption"><span class="seat-role"></span><span class="seat-status"></span></div><div class="seat-feedback"></div>';
    const seat={card,characterId:character?.id,avatarUrl:character?.avatarUrl,feedbackKey:'',status:'loading'};seats.set(player.id,seat);home.append(card);
    if(character){
      const stage=card.querySelector('.seat-stage');
      stage.innerHTML='<img class="seat-portrait"><span class="seat-loading" role="status">图片加载中…</span><button class="seat-retry" hidden>重新加载图片</button>';
      const img=stage.querySelector('img'),loading=stage.querySelector('.seat-loading'),retry=stage.querySelector('button');
      img.alt=player.name+' 的角色头像';card.dataset.character=character.id;
      seat.load=()=>{
        seat.status='loading';loading.hidden=false;loading.textContent='图片加载中…';retry.hidden=true;report();
        img.onload=()=>{if(seats.get(player.id)!==seat)return;loading.hidden=true;seat.status='ready';report();};
        img.onerror=()=>{if(seats.get(player.id)!==seat)return;loading.textContent='图片加载失败';retry.hidden=false;seat.status='error';report();};
        img.src=seat.avatarUrl;
      };
      retry.onclick=seat.load;seat.load();
    }else{card.querySelector('.seat-stage').remove();const mark=document.createElement('span');mark.className='human-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML='<svg viewBox="28 24 150 150" aria-hidden="true"><path class="ghost-body" fill-rule="evenodd" d="M34.2 91.2h9V81.1h9.3V71H68v-9.9h34.7V71H118v9.4h8.3v11.5h9.2V143h-8.2v12.8h-19.8V143H94.4v12.8H74.8V143H61.9v12.8H42.3v-12h-8.1zM71.8 100.3v13.6h13.1v-13.6zM105 100.3v13.6h13.1v-13.6z"/><path class="ghost-prop" d="M154 49h17v8h5v19h-7v11h-8v12h-7v12h-6v12h-7v13h-12v-19h7v-12h6V93h7V79h-5V63h5V55h5z"/><path class="ghost-detail" d="M149 78h20v9h-8v4h-12z"/></svg>';card.append(mark);}
    return seat;
  }
  function reconcile(players,home){
    const ids=new Set(players.map(p=>p.id));for(const id of seats.keys())if(!ids.has(id))remove(id);
    for(const [i,player] of players.entries()){
      const character=seatCharacter(player);let seat=seats.get(player.id);
      if(seat&&(seat.characterId!==character?.id||seat.avatarUrl!==character?.avatarUrl)){remove(player.id);seat=null;}
      seat||=mount(player,character,home);
      if(home.children[i]!==seat.card)home.insertBefore(seat.card,home.children[i]||null);
    }
  }
  function prepare(players){prepared=players.filter(p=>!p.human);if(!active)reconcile(prepared,parking);report();}
  function retryPrepared(){if(active)return;for(const seat of seats.values())if(seat.status==='error')seat.load?.();}
  function update(game,animating=false){
    if(!game||game.phase==='finished'){
      if(active){active=false;gameId=null;reconcile(prepared,parking);report();}
      return;
    }
    active=true;const changed=gameId!==game.id;gameId=game.id;reconcile(game.players,container);
    const places=tablePlaces(game.players);
    // Stable seats and portraits survive scoring and artist changes.
    for(const player of game.players){
      const character=seatCharacter(player),seat=seats.get(player.id);
      const {card}=seat,presentation=seatPresentation(game,player,animating),r=presentation.result;
      if(changed)seat.feedbackKey='';
      card.dataset.place=places.get(player.id);
      card.style.setProperty('--p-color',player.color||character?.color||'#67738f');
      card.setAttribute('aria-label',`${playerLabel(player)} · ${presentation.role}`);
      card.dataset.state=presentation.state;card.classList.toggle('is-artist',presentation.artist);card.classList.toggle('solved',!!r?.solved);
      card.querySelector('.seat-name').textContent=player.name;
      card.querySelector('.seat-model').textContent=playerModelLabel(player);
      card.querySelector('.seat-model').hidden=!!player.human;
      card.querySelector('.seat-score').textContent=game.mode==='relay'?`第 ${game.index+1} 棒`:`${presentation.total} 分`;
      card.querySelector('.seat-role').textContent=(player.human?'你 · ':'')+presentation.role;
      card.querySelector('.seat-status').textContent=presentation.status;

      const speech=latestSpeech(game,player.id),key=JSON.stringify([speech,r?.error]);
      if(key!==seat.feedbackKey){
        seat.feedbackKey=key;
        const dialogue=card.querySelector('.seat-dialogue');dialogue.hidden=!speech;
        if(speech){dialogue.dataset.kind=speech.kind;dialogue.tabIndex=0;dialogue.setAttribute('aria-label',`${player.name} 的消息`);dialogue.innerHTML=`<span class="speech-label">${escape(messageLabel(speech))}</span>${messageBody(speech)}`;}
        card.querySelector('.seat-feedback').innerHTML=r?.error?`<div class="error-message">${escape(r.error)}</div>`:'';
      }
    }
  }
  addEventListener('pagehide',clear,{once:true});
  return {update,prepare,retryPrepared,destroy:clear};
}
