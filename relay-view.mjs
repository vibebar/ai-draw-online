import {exportSummaryImage} from './export-summary.mjs';
import {openRelayReplay} from './replay.mjs';
import {paint} from './drawing.mjs';
import {escapeText as esc} from './conversation.mjs';
import {playerLabel,playerModelLabel} from './characters.mjs';
import {banterMarkup,captureBanterDraft,restoreBanterDraft} from './banter-view.mjs';

function drawingCaption(chain,position,playerName){
  const step=chain.steps[position],previous=chain.steps[position-1];
  if(!step)return `${playerName} 的画作：未完成`;
  if(step.skipped)return `${playerName} 的画作：这一棒留空`;
  // Later painters receive the preceding guess, which may differ from the original word.
  const word=position===0?chain.answer:previous?.kind==='guess'&&!previous.skipped?previous.text:null;
  return `${playerName} 画的：${word||'未收到词语'}`;
}

export function relayActionMarkup(g){
  const task=g.relay.myTask,errors=Object.values(g.results).filter(r=>r.status==='error');
  let html='';
  if(g.phase==='relay-pass')return `<h3>大家都交卷了</h3><p>${g.index+1===g.total?'最后一棒完成，马上展开所有接龙。':'图和词已经封好，马上一起传给下一位。'}</p><div class="relay-wait">✉ 统一传递中</div>`;
  if(!task)html='<h3>正在旁观接龙</h3><p>所有选手正在同一棒行动。为保留最后揭晓的乐趣，中途只显示交卷进度。</p>';
  else if(task.status==='skipped')html='<h3>这一棒留空了</h3><p>本链没有可继续传递的内容，等待其他选手完成。</p>';
  else if(task.status==='submitted')html=`<h3>你的这一棒已封好</h3><p>${task.kind==='draw'?'画作已提交。':`你写下了「${esc(task.submitted?.text||'')}」。`}等所有人交卷，再一起传递。</p><div class="relay-wait">✓ 已交卷 · 等待大家</div>`;
  else if(task.status==='working')html='<h3>正在封好你的作品…</h3>';
  else if(task.kind==='draw')html=`<h3>${g.index===0?'画出你的起始题目':'只画收到的词语'}</h3><p>${g.index===0?'这个词只有你看得到。':'上一位写了什么，就按什么画，不必猜原题。'}不要写文字提示。</p><button class="primary" data-action="relay-draw-submit">画好了，封好传递</button><button class="relay-pass-button" data-action="relay-pass">这一棒留空</button><small>留空后，这条链接下来的棒次也会留空。</small>`;
  else html=`<h3>${g.category==='成语'?'给下一位写一个四字成语':'给下一位写一个词'}</h3><p>${g.category==='成语'?'本局题库：成语。请按画面猜一个四字成语。':g.category?`本局题库：${esc(g.category)}。`:''}只看上一棒的画，不显示原题或更早的词语。</p><form id="relayGuessForm" class="guess-form"><input id="relayGuessInput" maxlength="80" aria-label="你的接龙词语" placeholder="${g.category==='成语'?'这幅画对应哪个四字成语？':'它画的是什么？'}" autocomplete="off"><button type="submit">封好传递</button></form><button class="relay-pass-button" data-action="relay-pass">这一棒留空</button><small>猜偏了也照传，最后一起看。</small>`;
  if(errors.length)html+=`<div class="relay-errors"><p>${errors.length} 位选手连接失败。已交卷的内容会保留。</p><div class="button-row"><button data-action="relay-retry">重试失败选手</button><button data-action="relay-skip-errors">失败的棒次留空</button></div><small>留空的链不再补猜；失败原因显示在对应角色下方。</small></div>`;
  return html;
}
export function relayStageMarkup(g){return `<div class="relay-progress-copy"><strong>第 ${g.index+1} 棒 · 全员${g.relay.kind==='draw'?'画图':'猜词'}</strong><span>${g.relay.done} / ${g.players.length} 已交卷</span></div><div class="relay-stage-track" aria-label="接龙进度">${Array.from({length:g.total},(_,i)=>`<span class="${i<g.index?'done':i===g.index?'current':''}" aria-label="第 ${i+1} 棒 ${i%2?'猜词':'画图'}">${i<g.index?'✓':i+1}<small>${i%2?'猜':'画'}</small></span>`).join('')}</div>`;}

export function renderRelayResults(container,g,act){
  const name=id=>{const p=g.players.find(p=>p.id===id);return p?playerLabel(p):'未知选手';};
  const count=g.chains.reduce((n,c)=>n+c.steps.filter(Boolean).length,0);
  container.innerHTML=`<div class="results-head"><div><h1>接龙总结<span class="relay-toggle-all"><button type="button" data-relay-toggle-all="close">全部收起</button><button type="button" data-relay-toggle-all="open">全部展开</button></span></h1>
    <p>${g.players.length} 位选手 · ${g.chains.length} 条链 · ${count} / ${g.total*g.chains.length} 棒已交卷</p></div>
    <div class="results-actions"><button id="relayReplayButton">回放</button><button id="relayExportButton">导出长图</button><button class="primary" id="relayHomeButton">回到主页</button></div></div>
    <div class="relay-chains">${g.chains.map((chain,i)=>{
    const steps=chain.steps.filter(Boolean),last=steps.at(-1);
    const ending=!last?'尚未交卷':last.skipped?'后续留空':last.kind==='draw'?'以画作收尾':`「${last.text}」`;
    const note=last?.kind==='guess'&&!last.skipped?(last.text===chain.answer?'末棒文字与原词一致':'末棒文字发生变化'):last?.kind==='draw'?'对照原题，看末棒画成了什么':'保留已完成的内容';
    return `<article class="relay-chain">
      <header class="relay-chain-heading">
        <div><h2>${i+1}. ${esc(name(chain.ownerId))} 的接龙</h2>
        <p>原题 → ${esc(ending)} · ${note}</p></div>
        <button type="button" class="relay-chain-toggle" data-relay-toggle aria-expanded="true">收起 ▴</button>
      </header>
      <p class="relay-route">传递顺序 · ${chain.route.map(id=>esc(name(id))).join(' → ')}</p>
      <div class="relay-timeline">
        <article class="relay-step relay-origin"><span class="relay-step-kind">原始题目</span><h3>${esc(chain.answer)}</h3></article>
        ${chain.route.map((id,position)=>{
      const step=chain.steps[position],kind=position%2?'猜词':'画图';
      return `<article class="relay-step ${!step||step.skipped?'relay-empty':''}"><header><span>第 ${position+1} 棒 · ${kind}</span><strong>${esc(position%2?name(id):drawingCaption(chain,position,name(id)))}</strong></header>${!step?'<div class="relay-step-text">未完成</div>':step.skipped?`<div class="relay-step-text">这一棒留空</div><p>${esc(step.skipReason)}</p>`:step.kind==='draw'?`<button class="relay-picture" data-relay-picture="${i}:${position}" aria-label="放大 ${esc(name(id))} 第 ${position+1} 棒的画"><canvas width="500" height="325" data-chain="${i}" data-position="${position}"></canvas><span>点开看大图 ↗</span></button>`:`<div class="relay-step-text">${esc(step.text)}</div>${step.reason?`<p class="relay-step-reason">${esc(step.reason)}</p>`:''}`}</article>`;
    }).join('')}</div><div class="relay-review" data-review-index="${i}"></div></article>`;
  }).join('')}</div>`;
  container.querySelectorAll('canvas').forEach(c=>paint(c,g.chains[+c.dataset.chain].steps[+c.dataset.position].shapes));
  container.querySelector('#relayHomeButton').onclick=()=>act('home');
  container.querySelector('#relayReplayButton').onclick=()=>openRelayReplay(g);
  // 接龙玩完后自动进入回放，每局只自动播一次。
  if(container.dataset.replayGame!==String(g.id)){container.dataset.replayGame=String(g.id);openRelayReplay(g);}
  const exportButton=container.querySelector('#relayExportButton');
  exportButton.onclick=async()=>{
    exportButton.disabled=true;exportButton.textContent='生成中…';
    try{await exportSummaryImage(g);exportButton.textContent='导出长图';}
    catch(e){exportButton.textContent='导出失败，再试一次';}
    finally{exportButton.disabled=false;}
  };
  container.onclick=e=>{
    const setChain=(chain,open)=>{chain.classList.toggle('collapsed',!open);const t=chain.querySelector('[data-relay-toggle]');t.setAttribute('aria-expanded',String(open));t.textContent=open?'收起 ▴':'展开 ▾';};
    const one=e.target.closest('[data-relay-toggle]');if(one){const chain=one.closest('.relay-chain');setChain(chain,chain.classList.contains('collapsed'));return;}
    const all=e.target.closest('[data-relay-toggle-all]');if(all){container.querySelectorAll('.relay-chain').forEach(c=>setChain(c,all.dataset.relayToggleAll==='open'));return;}
    const button=e.target.closest('[data-relay-picture]');if(!button)return;const [chainIndex,position]=button.dataset.relayPicture.split(':').map(Number),step=g.chains[chainIndex].steps[position];document.getElementById('relayPictureTitle').textContent=`第 ${position+1} 棒 · ${drawingCaption(g.chains[chainIndex],position,name(step.playerId))}`;paint(document.getElementById('relayPictureCanvas'),step.shapes);document.getElementById('relayPictureDialog').showModal();};
}


const name=(g,id)=>g.players.find(p=>p.id===id)?.name||'未知选手';
const modelBadge=(g,id)=>{const p=g.players.find(p=>p.id===id);return p&&!p.human?`<small class="relay-review-model">${esc(playerModelLabel(p))}</small>`:'';};
function ballotSummary(g,b){
  if(!b?.verdict)return '';
  const v=b.verdict,culprits=b.culprits;
  if(v.automatic)return '<div class="relay-review-verdict passed"><strong>原词 → 末词，完全一致！直接通过！</strong><span>免投票通关 · 大家说句感言</span></div>';
  return `<div class="relay-review-verdict ${v.passed?'passed':'failed'}"><strong>${v.passed===null?'无人投出有效票':v.passed?'这条链，通过！':'这条链，没过！'}</strong><span>${v.yes} 票通过 · ${v.no} 票不通过${v.abstained?' · '+v.abstained+' 票弃权':''}${v.yes===v.no&&v.yes?' · 平票不通过':''}</span>${culprits?`<p>${culprits.winners.length?`${culprits.winners.length>1?'并列':''}最大害群之马：<b>${culprits.winners.map(id=>esc(name(g,id))).join('、')}</b> · ${culprits.highest} 票`:'本轮全部弃权，没有选出最大害群之马。'}</p>`:''}</div>`;
}
function voteRows(g,votes,kind,revealed=false){
  return `<div class="relay-review-voters">${g.players.map(p=>{const v=votes[p.id]||{status:'waiting'},status={waiting:p.human?'等你投票':'等待投票',working:'正在投票…',queued:'排队中…',error:'连接失败',submitted:'已投票',abstained:'弃权'}[v.status];
    const choice=revealed&&v.status==='submitted'?(kind==='pass'?v.pass?'通过':'不通过':name(g,v.targetId)):status;
    return `<article class="relay-review-voter ${v.status}"><strong>${esc(p.name)}</strong>${modelBadge(g,p.id)}<span>${esc(choice)}</span>${revealed&&v.reason?`<p>${esc(v.reason)}</p>`:v.error?`<p>${esc(v.error)}</p>`:''}</article>`;
  }).join('')}</div>`;
}
function reflectionRows(g,b){return `<div class="relay-review-voters relay-review-reflections">${g.players.map(p=>{const entry=b.reflections?.[p.id]||{status:'optional'},text=entry.text||entry.error||({optional:'还没留言',working:'正在想通关感言…',queued:'感言排队中…',waiting:'等待感言'}[entry.status])||'未留言';return `<article class="relay-review-voter ${esc(entry.status)}"><strong>${esc(p.name)}</strong>${modelBadge(g,p.id)}<p>${esc(text)}</p></article>`;}).join('')}</div>`;}
function relayVoteRecord(g,b){return b?.verdict?`<div class="relay-review-record">${ballotSummary(g,b)}${b.verdict.automatic?reflectionRows(g,b):`<details><summary>查看每位选手的投票与理由</summary><h4>通过 / 不通过</h4>${voteRows(g,b.passVotes,'pass',true)}${b.culprits?`<h4>最大害群之马</h4>${voteRows(g,b.culpritVotes,'culprit',true)}`:''}</details>`}</div>`:'';}
function reflectionControls(g,b){
  if(!b.verdict?.automatic)return '';
  return `<section class="relay-review-reflection-controls">${b.reflections?.human?.status==='optional'?'<form data-reflection-form><label >你也来说一句（可选）</label><div><input data-reflection-input aria-label="通关感言" maxlength="120" placeholder="这都能传回来，谁救的场？" autocomplete="off"><button class="primary" type="submit">发表感言</button></div></form>':''}${Object.values(b.reflections||{}).some(r=>r.status==='error')?'<p>有感言没生成成功，通过结果已保留。</p><button data-review-action="reflection-retry">重试失败感言</button>':''}</section>`;
}

function reviewMarkup(game,chain,ballot){
  if(ballot.status==='idle'){
    return ballot.verdict?.automatic
      ? '<p class="relay-exact-pass">首尾词完全一致 · 自动通过</p><button data-review-action="start">邀请选手发表通关感言</button>'
      : '<button data-review-action="start">发起本链投票</button>';
  }
  if(ballot.status==='result'){
    return relayVoteRecord(game,ballot)+reflectionControls(game,ballot)+banterMarkup(ballot.banter);
  }

  const kind=ballot.status==='pass-vote'?'pass':'culprit';
  const votes=kind==='pass'?ballot.passVotes:ballot.culpritVotes;
  const hasHuman=game.players.some(p=>p.human);
  const waiting=hasHuman&&votes.human?.status==='waiting';
  const errors=Object.values(votes).some(v=>v.status==='error');
  const done=Object.values(votes).filter(v=>['submitted','abstained'].includes(v.status)).length;
  return `<section class="relay-review-ballot">
    <header><h3>${kind==='pass'?'这条链，过不过？':'谁让这条链偏离最多？'}</h3><span>${done} / ${game.players.length} 已投票</span></header>
    <p>${kind==='pass'?'判断末棒的图或词是否还保留原题的意思。通过票须多于不通过票。':'每人选一位造成最大偏离的选手，可以投自己。'}</p>
    ${kind==='culprit'?ballotSummary(game,ballot):''}
    ${waiting?`<div class="relay-review-vote-options">${kind==='pass'
      ? '<button data-review-vote="yes">通过 ✓</button><button data-review-vote="no">不通过 ×</button>'
      : chain.route.map(id=>`<button data-review-target="${esc(id)}">${esc(name(game,id))}</button>`).join('')}</div>`
      : `<p class="relay-review-vote-wait">${hasHuman?'你的票已封好，等大家投完统一公开。':'参赛 AI 正在各自投票。'}</p>`}
    ${voteRows(game,votes,kind)}
    ${errors?'<div class="relay-review-vote-errors"><p>有选手投票失败，已投的票会保留。</p><button data-review-action="retry">重试失败选手</button><button data-review-action="abstain">失败选手记为弃权</button></div>':''}
  </section>`;
}

export function updateRelayReviews(container,game,act){
  for(const [index,ballot] of game.relay.reviews.entries()){
    const chain=game.chains[index];
    const panel=container.querySelector('[data-review-index="'+index+'"]');
    const key=JSON.stringify(ballot);
    if(panel.dataset.key===key)continue;
    panel.dataset.key=key;
    const banterDraft=captureBanterDraft(panel);
    const oldInput=panel.querySelector('[data-reflection-input]');
    const focused=oldInput&&document.activeElement===oldInput;
    const open=panel.querySelector('.relay-review-record details')?.open;
    panel.innerHTML=reviewMarkup(game,chain,ballot);
    restoreBanterDraft(panel,banterDraft);
    const input=panel.querySelector('[data-reflection-input]');
    if(input&&oldInput){
      input.value=oldInput.value;
      if(focused){
        input.focus({preventScroll:true});
        input.setSelectionRange(oldInput.selectionStart,oldInput.selectionEnd);
      }
    }
    if(open&&panel.querySelector('.relay-review-record details'))panel.querySelector('.relay-review-record details').open=true;

    panel.onclick=async event=>{
      const button=event.target.closest('button');
      if(!button)return;
      const data={chainId:chain.id,kind:ballot.status==='pass-vote'?'pass':'culprit'};
      const commands={start:'relay-review',retry:'relay-vote-retry',abstain:'relay-vote-abstain','reflection-retry':'relay-reflection-retry'};
      let command=commands[button.dataset.reviewAction];
      if(button.dataset.reviewVote){
        command='relay-vote';
        data.pass=button.dataset.reviewVote==='yes';
      }
      if(button.dataset.reviewTarget){
        command='relay-vote';
        data.targetId=button.dataset.reviewTarget;
      }
      if(!command)return;
      button.disabled=true;
      await act(command,data);
      if(button.isConnected)button.disabled=false;
    };
    panel.onsubmit=event=>{
      if(!event.target.matches('[data-reflection-form]'))return;
      event.preventDefault();
      const text=input.value.trim();
      if(text)act('relay-reflection',{chainId:chain.id,text});
    };
  }
}
