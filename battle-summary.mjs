import {paint} from './drawing.mjs';
import {playerLabel} from './characters.mjs';
import {escapeText as esc,recapMarkup} from './conversation.mjs';
import {banterMarkup} from './banter-view.mjs';
import {exportSummaryImage} from './export-summary.mjs';
import {openBattleReplay} from './replay.mjs';

function award(players,score,possible){
  const eligible=players.filter(player=>player[possible]>0);
  if(!eligible.length)return {name:'暂无',rate:'—'};
  const best=Math.max(...eligible.map(player=>player[score]/player[possible]));
  const winners=eligible.filter(player=>player[score]/player[possible]===best);
  return {name:winners.map(player=>player.name).join('、'),rate:Math.round(best*100)+'%'};
}

function attemptMarkup(round,attempt,players){
  const guesses=players.flatMap(player=>{
    const entry=round.results[player.id]?.history.find(guess=>guess.turn===attempt.turn);
    if(!entry)return [];
    const status=entry.skipped?'跳过':entry.correct?'猜中 · +'+entry.points+' 分':'未猜中';
    return [`<li><b>${esc(player.name)}</b> · ${entry.skipped?'':esc(entry.guess)+' · '}${status}
      ${entry.reason&&!entry.skipped?`<small>${esc(entry.reason)}</small>`:''}</li>`];
  });
  return `<li class="summary-attempt">
    <h4>第 ${attempt.turn} 版画作</h4>
    <canvas width="500" height="325" role="img" aria-label="${esc(round.answer)}的第 ${attempt.turn} 版画作"
      data-round="${round.index}" data-turn="${attempt.turn}"></canvas>
    ${attempt.hint?`<p>公开提示 · ${esc(attempt.hint)}</p>`:''}
    ${guesses.length?`<ul class="summary-guesses">${guesses.join('')}</ul>`:'<p>这版画作暂无已提交的猜词。</p>'}
  </li>`;
}

export function renderBattleSummary(container,game,act){
  const ranking=[...game.players].sort((a,b)=>b.total-a.total);
  const score=ranking[0].total,winners=ranking.filter(p=>p.total===score).map(p=>p.name).join('、');
  const draw=award(ranking,'drawScore','drawPossible'),guess=award(ranking,'guessScore','guessPossible');
  container.innerHTML=`<div class="results-head"><div><h1>比赛总结<span class="relay-toggle-all"><button type="button" data-relay-toggle-all="close">全部收起</button><button type="button" data-relay-toggle-all="open">全部展开</button></span></h1><p>${game.history.length} / ${game.total} 题 · ${game.players.length} 位选手</p></div>
    <div class="results-actions"><button id="replayButton">回放</button><button id="exportButton">导出长图</button><button id="homeButton" class="primary">回到主页</button></div></div>
    <div class="awards">
      <article class="award"><small>总冠军</small><strong>${esc(winners)}</strong><p>${score} 分</p></article>
      <article class="award"><small>最佳画手</small><strong>${esc(draw.name)}</strong><p>${draw.rate} · 作画得分 / 可得满分</p></article>
      <article class="award"><small>最佳猜手</small><strong>${esc(guess.name)}</strong><p>${guess.rate} · 猜题得分 / 可得满分</p></article>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>名次</th><th>选手</th><th>总分</th><th>画图分</th><th>猜题分</th><th>猜中题数</th><th>画了几幅</th></tr></thead>
      <tbody>${ranking.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(playerLabel(p))}</td><td><b>${p.total}</b></td>
        <td>${p.drawScore} / ${p.drawPossible}</td><td>${p.guessScore} / ${p.guessPossible}</td><td>${p.hits} / ${p.guessPossible/3}</td><td>${p.drawn}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2 class="gallery-heading">每题的画作与猜词</h2>
    <div class="battle-rounds">${game.history.map(round=>`<article class="battle-round">
      <header class="battle-round-heading"><div><h3>第 ${round.index+1} 题 · ${esc(round.answer)}</h3><p>${esc(round.artistName)} 作画 · +${round.drawGain} 分</p></div><button type="button" class="relay-chain-toggle" data-battle-toggle aria-expanded="true">收起 ▴</button></header>
      ${round.attempts.length?`<ol class="summary-attempts">${round.attempts.map(attempt=>attemptMarkup(round,attempt,game.players)).join('')}</ol>`:'<p class="summary-empty">本题暂无已完成的画作。</p>'}
      ${recapMarkup(round.recap)}${banterMarkup(round.banter,{controls:false})}
    </article>`).join('')}</div>`;

  const rounds=new Map(game.history.map(round=>[round.index,round]));
  for(const canvas of container.querySelectorAll('canvas[data-round]')){
    const attempt=rounds.get(Number(canvas.dataset.round)).attempts[Number(canvas.dataset.turn)-1];
    paint(canvas,attempt.shapes);
  }
  container.querySelector('#homeButton').onclick=()=>act('home');
  container.querySelector('#replayButton').onclick=()=>openBattleReplay(game);
  const exportButton=container.querySelector('#exportButton');
  exportButton.onclick=async()=>{
    exportButton.disabled=true;exportButton.textContent='生成中…';
    try{await exportSummaryImage(game);exportButton.textContent='导出长图';}
    catch(e){exportButton.textContent='导出失败，再试一次';}
    finally{exportButton.disabled=false;}
  };
  const setRound=(round,open)=>{round.classList.toggle('collapsed',!open);const t=round.querySelector('[data-battle-toggle]');t.setAttribute('aria-expanded',String(open));t.textContent=open?'收起 ▴':'展开 ▾';};
  container.onclick=e=>{
    const one=e.target.closest('[data-battle-toggle]');if(one){const r=one.closest('.battle-round');setRound(r,r.classList.contains('collapsed'));return;}
    const all=e.target.closest('[data-relay-toggle-all]');if(all)container.querySelectorAll('.battle-round').forEach(r=>setRound(r,all.dataset.relayToggleAll==='open'));
  };
}
