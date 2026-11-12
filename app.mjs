import {createPanelDrawer} from './panel-drawer.mjs';
import {hintControl,visualHint,HINT_MODES,hintModeInfo} from './visual-hints.mjs';
import {updateArenaLayout} from './seat-presentation.mjs';
import {W,H,paint,drawShape,DrawingHistory} from './drawing.mjs';
import {CELEBRATION_MS} from './avatar-state.mjs';
import {createPlayerSeats} from './player-seats.mjs';
import {createConversation,recapMarkup} from './conversation.mjs';
import {drawingTransition,playbackFactor,strokeDuration,animateProgress,partialStroke} from './drawing-playback.mjs';
import {playerLabel,playerModelLabel,CHARACTER_MAP} from './characters.mjs';
import {mountSettings} from './settings-view.mjs';
import {relayActionMarkup,relayStageMarkup,renderRelayResults,updateRelayReviews} from './relay-view.mjs';
import {renderBattleSummary} from './battle-summary.mjs';
import {createMatch} from './lib/match.mjs';
import {createSettings,preferencePrefix} from './lib/settings.mjs';
import {CATEGORIES,CATEGORY_LEVELS} from './lib/words.mjs';
import {banterMarkup,banterPending,bindBanterControls,captureBanterDraft,restoreBanterDraft} from './banter-view.mjs';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settings=createSettings();
const config={players:settings.list(),categories:CATEGORIES,categoryLevels:CATEGORY_LEVELS};
const match=createMatch(scheduleRender);
let game=null,mode='battle',human=true,category='成语',idiomLevel='easy',rounds=1,selected=new Set(),localShapes=[],color='#202633',erasing=false,currentStroke=null;
let groupSelection=new Set();
let canvasKey='',actionKey='',resultKey='',animation=0,animating=false,inFlight=0,autoSent='',toastTimer,celebrationTimer,renderPending=false;
let actionDraftScope='',hintMode='visual',shownQuestion='';
try{const saved=localStorage.getItem(preferencePrefix+'hintMode');if(HINT_MODES.some(item=>item.id===saved))hintMode=saved;}catch{}
const lobbyIntro={heading:document.querySelector('.intro h1').innerHTML,text:document.querySelector('.intro-text').innerHTML,note:document.querySelector('.rule-note').innerHTML};
const canvas=$('canvas');
const drawingHistory=new DrawingHistory();
const preparation=document.createElement('div');preparation.className='lobby-preparation';preparation.innerHTML='<span id="characterPreparation" role="status" aria-live="polite"></span><button class="quiet" id="retryCharacterPreparation" hidden>重试未加载角色</button>';document.querySelector('.setup-panel').append(preparation);
const playerSeats=createPlayerSeats($('guessers'),{onPreparation:({total,ready,failed})=>{
  $('characterPreparation').textContent=!total?'':ready===total?'':`正在准备参赛角色 ${ready} / ${total}${failed?` · ${failed} 位未加载成功`:''} · 可以继续选择比赛`;
  preparation.dataset.ready=String(total>0&&ready===total);$('retryCharacterPreparation').hidden=!failed;
}});
$('retryCharacterPreparation').onclick=()=>playerSeats.retryPrepared();
const conversation=createConversation($('conversationPanel'));
bindBanterControls($('actionPanel'),act);bindBanterControls($('results'),act);
document.querySelector('.final-setup').insertAdjacentHTML('beforebegin','<div class="setup-row banter-setting"><span class="row-label">赛后互动</span><div><div class="banter-modes" role="radiogroup" aria-label="赛后互动"><label class="check"><input type="radio" name="banterMode" value="critique" checked> 自动挑错</label><label class="check"><input type="radio" name="banterMode" value="praise"> 自动表扬</label><label class="check"><input type="radio" name="banterMode" value="off"> 关闭</label></div><p class="hint-mode-help">答案或本链投票揭晓后，随机点名，最多两组。挑错会指出对方的问题，表扬会夸对方做得好的地方。你也可以主动点名一位 AI，对方必须回应；关闭后仍可主动点名。</p></div></div>');
const banterMode=()=>document.querySelector('input[name="banterMode"]:checked')?.value||'critique';
try{const saved=localStorage.getItem(preferencePrefix+'banter'),mode=saved==='false'?'off':['critique','praise','off'].includes(saved)?saved:'critique';document.querySelector(`input[name="banterMode"][value="${mode}"]`).checked=true;}catch{}
document.querySelectorAll('input[name="banterMode"]').forEach(input=>{input.onchange=()=>{try{localStorage.setItem(preferencePrefix+'banter',banterMode());}catch{}};});
const banterFilter=document.createElement('option');banterFilter.value='banter';banterFilter.textContent='赛后互动';$('conversationPanel').querySelector('select').append(banterFilter);
const panelDrawer=createPanelDrawer(); 
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function confirmAction(title,text,yes='确定'){return new Promise(resolve=>{$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmYes').textContent=yes;const d=$('confirmDialog');const close=value=>{d.close();resolve(value);};$('confirmYes').onclick=()=>close(true);$('confirmCancel').onclick=()=>close(false);d.oncancel=()=>resolve(false);d.showModal();});}

const LOBBY_PREVIEW=['chatgpt','gemini','deepseek'];
function renderLobby(){
  // 大厅只列出已连接 Key 的 AI；一个都没有时引导去连接。
  const readyPlayers=config.players.filter(p=>p.ready);
  for(const id of [...selected])if(!readyPlayers.some(p=>p.id===id))selected.delete(id);
  if(mode==='duel'&&!selected.size&&readyPlayers.length)selected.add(readyPlayers[0].id);
  // 各家 AI 都列出来：没连接的是灰色小框，点一下去连接；连接好的亮起来，可以勾选上场。
  // ChatGPT、Gemini、DeepSeek 没连接时显示灰色小框作为示例；连接好的 AI 亮起来，按这三家在前的顺序排列。
  const rank=p=>{const i=LOBBY_PREVIEW.indexOf(p.characterId);return i<0?LOBBY_PREVIEW.length:i;};
  const lit=readyPlayers.slice().sort((a,b)=>rank(a)-rank(b));
  const chip=p=>`<button class="chip ${selected.has(p.id)?'selected':''}" data-player="${esc(p.id)}" aria-pressed="${selected.has(p.id)}" title="${esc(playerLabel(p))}" style="--p-color:${esc(p.color)}"><span class="chip-dot"></span>${esc(p.name)}</button>`;
  const grey=id=>`<button class="chip off" data-connect="${id}" title="${esc(CHARACTER_MAP[id].name)} 还没连接，点一下去连接">${esc(CHARACTER_MAP[id].name)}</button>`;
  const items=[...LOBBY_PREVIEW.flatMap(id=>{const own=lit.filter(p=>p.characterId===id);return own.length?own.map(chip):[grey(id)];}),...lit.filter(p=>rank(p)===LOBBY_PREVIEW.length).map(chip)];
  $('players').innerHTML=`<button class="chip human ${human?'selected':''}" data-human="1" aria-pressed="${human}">✦ 你 <small>人类</small></button>`+items.join('')+`<button class="chip add-ai" data-connect="">＋ 添加 AI</button>`;
  const levels=config.categoryLevels[category],level=levels.find(item=>item.id===idiomLevel)||levels[0];
  $('categories').innerHTML=config.categories.map(c=>{const count=config.categoryLevels[c.name].find(l=>l.id===idiomLevel)?.count??c.count;return `<button class="chip ${category===c.name?'selected':''}" data-category="${esc(c.name)}" aria-pressed="${category===c.name}">${esc(c.name)} <small>${count.toLocaleString('zh-CN')}</small></button>`;}).join('');
  $('idiomLevelRow').hidden=!levels.length;
  $('idiomLevelRow').querySelector('.row-label').textContent='题库难度';
  $('idiomLevels').setAttribute('aria-label',category+'难度');
  $('idiomLevels').innerHTML=levels.map(item=>`<button class="chip ${item.id===idiomLevel?'selected':''}" data-idiom-level="${item.id}" aria-pressed="${item.id===idiomLevel}">${item.name} <small>${item.count.toLocaleString('zh-CN')} 题</small></button>`).join('');
  $('idiomLevelHelp').textContent=level?.description||'';
  $('hintModeRow').hidden=mode==='relay';
  $('hintModes').innerHTML=HINT_MODES.map(item=>`<button class="chip ${item.id===hintMode?'selected':''}" data-hint-mode="${item.id}" aria-pressed="${item.id===hintMode}">${item.label}</button>`).join('');
  $('hintModeHelp').textContent=hintModeInfo(hintMode).description;
  const count=selected.size+(human?1:0),relay=mode==='relay';$('matchInfo').textContent=relay?`${count} 条链 · ${count} 棒 · 每人 ${count} 次接力${!human?' · 观战模式':''}`:`${count} 位选手 · 共 ${count*rounds} 题${!human?' · 观战模式':''}`;
  $('roundOptions').hidden=relay;$('relaySetupNote').hidden=!relay;$('relaySetupNote').textContent=`每人一个起始题目，同时传递。每位 AI 完成 ${count} 棒，共约 ${selected.size*count} 次画猜调用。赛后可按链发起投票和互动。`;
  document.querySelector('.final-setup .row-label').textContent=relay?'接龙配置':'每人画几幅';$('startButton').innerHTML=relay?'开始传画接龙 <span aria-hidden="true">↝</span>':'开始比赛 <span aria-hidden="true">✦</span>';
  document.querySelector('.intro h1').innerHTML=relay?'传一幅<span class="pink">画</span>，<br>歪出一个新<span class="pink">故事</span>。':lobbyIntro.heading;
  document.querySelector('.intro-text').innerHTML=relay?'你画我猜，猜完再画。每个人只看上一棒，<br>等所有链条走完，再一起拆开看。':lobbyIntro.text;
  document.querySelector('.rule-note').innerHTML=relay?'<span class="note-tape"></span><strong>传画接龙小抄</strong><p><b>同时行动</b> · 全员画图 / 全员猜词交替</p><p><b>统一传递</b> · 全部交卷才进入下一棒</p><p><b>随机均衡</b> · 每条链都经过每人一次</p><p><b>最后揭晓</b> · 同页查看所有链条</p>':lobbyIntro.note;
  document.querySelectorAll('[data-mode]').forEach(e=>{e.classList.toggle('selected',e.dataset.mode===mode);e.setAttribute('aria-pressed',e.dataset.mode===mode);});
  document.querySelectorAll('[data-rounds]').forEach(e=>{e.classList.toggle('selected',+e.dataset.rounds===rounds);e.setAttribute('aria-pressed',+e.dataset.rounds===rounds);});
  playerSeats.prepare(config.players.filter(p=>selected.has(p.id)));
  if(mode==='battle')$('matchInfo').textContent+=' · 每局随机出场';
  if(!readyPlayers.length)$('matchInfo').textContent='先在「AI 设置」连接至少一位 AI';
}
$('players').onclick=e=>{{const c=e.target.closest('[data-connect]');if(c){openSettings(c.dataset.connect);return;}}const h=e.target.closest('[data-human]'),p=e.target.closest('[data-player]');if(h){if(mode==='duel')return toast('单人模式需要你参加。');human=!human;}if(p){const id=p.dataset.player;if(mode==='duel')selected=new Set([id]);else selected.has(id)?selected.delete(id):selected.add(id);}renderLobby();};
$('categories').onclick=e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;renderLobby();}};
$('idiomLevels').onclick=e=>{const b=e.target.closest('[data-idiom-level]');if(b){idiomLevel=b.dataset.idiomLevel;renderLobby();$('idiomLevels').querySelector(`[data-idiom-level="${idiomLevel}"]`).focus();}};
$('hintModes').onclick=e=>{const b=e.target.closest('[data-hint-mode]');if(!b)return;hintMode=b.dataset.hintMode;try{localStorage.setItem(preferencePrefix+'hintMode',hintMode);}catch{}renderLobby();$('hintModes').querySelector('[data-hint-mode="'+hintMode+'"]').focus();};
$('roundOptions').onclick=e=>{const b=e.target.closest('[data-rounds]');if(b){rounds=+b.dataset.rounds;renderLobby();}};
document.querySelector('.mode-tabs').onclick=e=>{
  const nextMode=e.target.closest('[data-mode]')?.dataset.mode;
  if(!nextMode||nextMode===mode)return;
  if(nextMode==='duel'){
    groupSelection=selected;
    selected=new Set([...selected].slice(0,1));
    human=true;
  }else if(mode==='duel'){
    selected=groupSelection;
  }
  mode=nextMode;
  renderLobby();
};
$('startButton').onclick=()=>{
  const count=selected.size+(human?1:0);if(count<2||!selected.size)return toast('请至少选择一位 AI，并确保共有两位选手。');
  const missing=config.players.filter(p=>selected.has(p.id)&&!p.ready);
  if(missing.length){toast(`${missing.map(p=>p.name).join('、')} 尚未填写 API Key。`);openSettings();return;}
  $('startButton').disabled=true;
  try{match.start({players:settings.select([...selected]),human,mode,category,wordLevel:idiomLevel,hintMode,banter:banterMode(),rounds:mode==='relay'?1:rounds});resetView();}catch(e){toast(e.message);}finally{$('startButton').disabled=false;}
};
function resetView(){canvasKey='';actionKey='';resultKey='';autoSent='';localShapes=[];drawingHistory.reset();currentStroke=null;animation++;animating=false;window.scrollTo({top:0,behavior:'instant'});}
async function act(action,extra={}){
  const id=game?.id;if(!id)return;
  inFlight++;
  try{await match.action(id,action,extra);syncMatch();return true;}
  catch(e){toast(e.message);autoSent='';actionKey='';if(game&&game.phase!=='finished')renderAction();return false;}
  finally{inFlight--;maybeAuto();}
}
function syncMatch(){
  game=match.snapshot();
  render();
  clearTimeout(celebrationTimer);
  if(!game||game.phase==='finished')return;
  const now=Date.now();
  const remaining=Object.values(game.results)
    .filter(result=>result.solved&&result.judgedAt)
    .map(result=>result.judgedAt+CELEBRATION_MS-now)
    .filter(delay=>delay>0);
  if(remaining.length)celebrationTimer=setTimeout(syncMatch,Math.min(...remaining));
}
function scheduleRender(){
  if(renderPending)return;
  renderPending=true;
  queueMicrotask(()=>{renderPending=false;syncMatch();});
}
function render(){
  $('lobby').hidden=!!game;$('game').hidden=!game||game.phase==='finished';$('results').hidden=!game||game.phase!=='finished';
  const relay=game?.mode==='relay';$('game').classList.toggle('relay-arena',relay);$('relayStageBar').hidden=!relay||game?.phase==='finished';$('autoContinue').closest('label').hidden=relay;document.querySelector('.playback-speed').hidden=relay;
  playerSeats.update(game,animating);
  panelDrawer.update(game);
  updateArenaLayout(game);
  conversation.update(game);
  // 有 AI 连不上时，在选手席标题旁说明原因。
  const failed=game&&game.phase!=='finished'?Object.values(game.results||{}).filter(r=>r?.status==='error'):[];
  const drawFailed=game?.phase==='draw-error'&&game.drawErrorKind==='request';
  const notice=$('seatNotice');notice.hidden=!failed.length&&!drawFailed;
  if(!notice.hidden)notice.textContent=([...failed.map(r=>r.error),drawFailed?game.notice:''].some(e=>String(e||'').includes('402'))?'用 OpenRouter 免费额度时，部分 AI 会显示 402 连不上。':'有 AI 连不上。')+'用聚合平台时，用不了的 AI 可以在「AI 设置」里直接删掉。';
  if(!game)return;if(game.phase==='finished'){renderResults();return;}
  // 换到新题（或接龙的下一棒）时，如果画布已经滚出屏幕，自动滚回对局顶部。
  const questionKey=game.id+'-'+game.index;
  if(shownQuestion!==questionKey){const sameMatch=shownQuestion.startsWith(game.id+'-');shownQuestion=questionKey;if(sameMatch&&$('game').getBoundingClientRect().top<0)$('game').scrollIntoView({behavior:'smooth',block:'start'});}
  if(relay){renderRelay();return;}const g=game;
  $('roundLabel').textContent=`第 ${g.index+1} / ${g.total} 题 · 画手：${g.artistName||'准备中'} · ${g.category}${(g.wordLevelName||g.idiomLevelName)?' / '+(g.wordLevelName||g.idiomLevelName):''} · ${g.length} 个字 · ${hintModeInfo(g.hintMode).name}`;
  $('wordLabel').textContent=g.answer||'？'.repeat(Math.min(g.length||4,10));
  const key=`${g.id}-${g.index}-${g.revision}`;
  if(canvasKey!==key){const previous=canvasKey.startsWith(`${g.id}-${g.index}-`)?localShapes:[];canvasKey=key;localShapes=structuredClone(g.shapes);drawingHistory.reset();currentStroke=null;animation++;animating=false;$('playbackControls').hidden=true;if(g.shapes.length&&!g.artistHuman&&g.phase==='ready')animateDrawing(g.shapes,previous);else paint(canvas,localShapes);}
  const drawable=g.artistHuman&&g.phase==='drawing';$('toolbar').hidden=!drawable;canvas.parentElement.classList.toggle('drawable',drawable);
  $('canvasCaption').textContent=drawable?'你的画布 · 1000 × 650':g.shapes.length?`${g.artistName} 的画布`:'';
  const status=$('canvasStatus');status.hidden=g.phase!=='drawing-ai';
  if(g.phase==='drawing-ai')status.innerHTML=`<div class="spinner"></div><span>${esc(g.artistName)} 正在${g.turn>1?'改画':'构思'}…</span><small>模型响应后，会逐笔画出来</small>`;
  $('underCanvas').textContent=g.myHint?`只给你的提示：${g.myHint}${g.hint?' · 公开提示：'+g.hint:''}`:g.hint?`画手公开提示：${g.hint}`:drawable?'画图表达题目，不要写答案。支持鼠标和触屏，Ctrl+Z 撤销。':g.phase==='ready'||g.phase==='guessing'?'所有猜手看到的都是这一张画布。':'';
  renderAction();renderGuessers();maybeAuto();
}
function renderRelay(){
  const g=game,task=g.relay.myTask,drawable=canDraw();
  $('roundLabel').textContent=`传画接龙 · 第 ${g.index+1} / ${g.total} 棒 · ${g.category}${(g.wordLevelName||g.idiomLevelName)?' / '+(g.wordLevelName||g.idiomLevelName):''}`;
  $('wordLabel').textContent=task?.input?(task.kind==='draw'?task.input.text:'这幅画，像什么？'):g.relay.kind==='draw'?'所有人一起画图':'所有人一起猜词';
  $('relayStageBar').innerHTML=relayStageMarkup(g);
  const key=`relay-${g.id}-${g.index}-${task?.chainId||'spectator'}`;
  if(canvasKey!==key){canvasKey=key;localShapes=structuredClone(task?.kind==='guess'?task.input?.shapes||[]:task?.submitted?.shapes||[]);drawingHistory.reset();currentStroke=null;animation++;animating=false;paint(canvas,localShapes);window.scrollTo({top:0,behavior:'instant'});}
  $('playbackControls').hidden=true;$('toolbar').hidden=!drawable;canvas.parentElement.classList.toggle('drawable',drawable);
  $('canvasCaption').textContent=task?.kind==='guess'&&task.input?`${task.fromName||'上一位'} 传来的画`:task?.kind==='draw'?'你的独立画布 · 只有交卷后才会传出去':'';
  const status=$('canvasStatus');status.hidden=!!task?.input;
  if(!status.hidden)status.innerHTML=!task?'<span class="relay-spectator-icon">✉</span><span>大家正在各自完成这一棒</span><small>只显示进度，所有作品在结束后展开</small>':'<span>这一棒没有收到内容</span><small>本链留空，等待大家交卷</small>';
  $('underCanvas').textContent=task?.kind==='draw'?(g.index===0?'这是你的起始题目，其他人看不到。':'只根据上一棒的词语画图，前面的历史暂时保密。'):task?.kind==='guess'?(g.category==='成语'?'只根据眼前的画猜一个四字成语，猜偏了也会照样传递。':'只根据眼前这幅画写一个词或短句，猜偏了也会照样传递。'):'随机均衡队列 · 每条链都经过所有人一次';
  $('guessProgress').textContent=`${g.relay.done} / ${g.players.length} 已交卷`;
  $('privacyNote').textContent='别人的题目、画作和猜词会在接龙结束后一起公开。';
  renderRelayAction();playerSeats.update(g,false);
}
function renderRelayAction(){
  const g=game,task=g.relay.myTask,key=JSON.stringify(['relay',g.id,g.index,g.phase,task?.status,Object.values(g.results).filter(r=>r.status==='error').length]);if(actionKey===key)return;actionKey=key;
  const previous=$('relayGuessInput'),draft=previous?.value||'',focused=previous&&document.activeElement===previous;
  $('actionPanel').innerHTML=relayActionMarkup(g);
  const form=$('relayGuessForm');if(form){const input=$('relayGuessInput');input.value=draft;if(focused)input.focus();form.onsubmit=e=>{e.preventDefault();const guess=input.value.trim();if(!guess)return;form.querySelector('button').disabled=true;act('relay-submit',{stage:g.index,chainId:task.chainId,guess});};}
}
async function animateDrawing(shapes,previous=[]){
  
  const token=++animation,plan=drawingTransition(previous,shapes),shown=previous.slice();animating=true;playerSeats.update(game,true);$('playbackControls').hidden=false;
  const speed=()=>playbackFactor($('playbackSpeed').value);
  paint(canvas,shown);
  for(let i=0;i<plan.remove;i++){
    if(token!==animation)return;shown.pop();paint(canvas,shown);$('playbackStatus').textContent=`撤回 ${i+1} / ${plan.remove} 笔，保留其余画面`;
    await new Promise(r=>setTimeout(r,220*speed()));
  }
  for(let i=0;i<plan.append.length;i++){
    if(token!==animation)return;const shape=plan.append[i];$('playbackStatus').textContent=`${previous.length?'补画':'落笔'} ${i+1} / ${plan.append.length}`;
    const duration=strokeDuration(shape,$('playbackSpeed').value);
    
    const completed=await animateProgress(duration,{isActive:()=>token===animation,draw:progress=>paint(canvas,[...shown,partialStroke(shape,progress)])});
    if(!completed)return;
    shown.push(shape);
  }
  if(token!==animation)return;paint(canvas,shapes);animating=false;playerSeats.update(game,false);$('playbackControls').hidden=true;maybeAuto();
}
$('finishDrawingButton').onclick=()=>{animation++;animating=false;paint(canvas,localShapes);$('playbackControls').hidden=true;playerSeats.update(game,false);maybeAuto();};
function maybeAuto(){if(game?.phase!=='ready'||game.artistHuman||!$('autoContinue').checked||animating||inFlight)return;const key=`${game.id}-${game.index}-${game.turn}`;if(autoSent===key)return;autoSent=key;submitCanvas();}
$('autoContinue').onchange=maybeAuto;
function readHintChoice(row){const text=row.querySelector('[data-hint-text]');if(text)return text.value.trim()||null;const focus=row.querySelector('[data-hint-focus]').value;return focus?{region:row.querySelector('[data-hint-region]').value,focus}:null;}
$('actionPanel').addEventListener('change',e=>{const row=e.target.closest('[data-hint-recipient]'),preview=row?.querySelector('[data-hint-preview]');if(!preview)return;try{preview.textContent=visualHint(readHintChoice(row),localShapes,game.hintMode).text||'不发送提示';}catch(error){preview.textContent=error.message;}});
function submitCanvas(){if(currentStroke||inFlight||animating)return;const shapes=localShapes;if(!shapes.length)return toast('先在画布上画几笔。');const hints={};let hint=null;try{for(const row of document.querySelectorAll('[data-hint-recipient]')){const choice=readHintChoice(row);visualHint(choice,shapes,game.hintMode);if(row.dataset.hintRecipient==='$public')hint=choice;else hints[row.dataset.hintRecipient]=choice;}}catch(e){return toast(e.message);}act('draw-done',{shapes,hint,hints});}
function renderAction(){
  if(game?.mode==='relay'){renderRelayAction();return;}
  const g=game,hr=g.results.human,errors=Object.values(g.results).filter(r=>r.status==='error');
  const key=JSON.stringify([g.index,g.phase,g.turn,hr?.status,g.notice,errors.length,g.recap,g.hintMode,g.banter]);if(key===actionKey)return;actionKey=key;
  let html='';
  const currentHintMode=g.hintMode||'visual',hintRule=currentHintMode==='preset'?'选择画面区域和观察重点，生成固定提示；画里没有的内容请先补画。':'自由提醒画里的具体内容，或纠正误读；别写词语或成语的释义。';
  if(g.phase==='drawing')html=`<h3>轮到你画了 ✎</h3><p>用画笔表达「${esc(g.answer)}」。其他选手看不到题目。</p>${currentHintMode==='none'?'<p class="hint-rule">本局禁止任何提示，只能通过补画帮助猜题。</p>':g.turn>1?`<p class="hint-rule">${hintRule}</p>${hintControl('公开提示','$public',g.hintChoice,currentHintMode)}<details class="private-hints"><summary>单独提示未猜中的选手</summary>${g.players.filter(p=>g.results[p.id]&&!g.results[p.id].solved).map(p=>hintControl('只给 '+p.name,p.id,g.privateHintChoices?.[p.id],currentHintMode)).join('')}</details>`:''}<button class="primary" data-action="submit">${g.turn>1?'改好了，再猜一轮':'画好了，开始猜'}</button>`;
  if(g.phase==='drawing-ai')html=`<h3>画手正在${g.turn>1?'改画':'构思'}</h3><p>${esc(g.artistName)} 正在生成第 ${g.turn} 版画面。通常需要十几秒到一分钟。</p><div class="button-row"><button data-action="reveal-confirm">跳过本题</button></div>`;
  if(g.phase==='ready')html=`<h3>画好了，轮到大家猜</h3><p>第 ${g.turn} / 3 次机会 · 本次猜中得 ${4-g.turn} 分</p><button class="primary" data-action="submit">开始猜画</button>`;
  if(g.phase==='guessing') {
    const humanWaiting=hr&&!hr.solved&&hr.status==='waiting';
    html=`<h3>第 ${g.turn} / 3 轮猜题</h3><p>${humanWaiting?'你有一次机会，想好了再提交。':hr?.solved?'你已猜中，等其他选手完成。':'大家正在独立看图猜答案。'}</p>`;
    if(humanWaiting)html+='<form id="guessForm" class="guess-form"><input id="guessInput" maxlength="80" placeholder="输入你的答案" aria-label="你的答案" autocomplete="off"><button type="submit">猜</button></form><div class="button-row"><button data-action="pass">跳过这次</button></div>';
    else if(hr?.status==='confident')html+='<p class="confident-note">✦ 答案已锁定，等大家交卷后统一揭晓。</p>';
    else if(hr?.status==='submitted')html+='<p>本次已跳过，等待其他人。</p>';
    else if(hr?.status==='wrong')html+='<p>这次没猜中，等大家完成后可以看画手改画。</p>';
    if(errors.length)html+='<p class="error-message">有选手连接失败。本次机会尚未扣除。</p><div class="button-row"><button data-action="retry-guesses">重试失败选手</button><button data-action="skip-errors">跳过失败选手</button></div>';
  }
  if(g.phase==='locked')html='<h3>答案已锁定 · 等待揭晓</h3><p>大家都交卷了，似乎都觉得自己稳了…</p><p class="confident-note">✦ 马上公布本轮结果</p>';
  if(g.phase==='review')html=`<h3>还有人没猜中</h3><p>第 ${g.turn} 轮结束。${currentHintMode==='none'?'本局禁止提示，画手只能补画，再让大家猜一次。':currentHintMode==='preset'?'画手可补画，并选择画面区域和观察重点给出固定提示。':g.artistHuman?'可以补画、指出画里的具体内容，或纠正选手的误读。':'让画手参考大家的误读补画，并给出读图提醒。'}</p><button class="primary" data-action="revise">${g.artistHuman?'继续画，再试一次':'让 AI 改画，再猜一次'}</button><div class="button-row"><button data-action="reveal-confirm">公布答案</button></div>`;
  if(g.phase==='draw-error')html=`<h3>${g.drawErrorKind==='format'?'画手返回的笔画格式有误':'画手暂时未能完成作画'}</h3><p class="error-message">${esc(g.notice)}</p>${g.shapes?.length?'<p>上一版画面已保留，重试不会扣除猜题机会。</p>':''}<button class="primary" data-action="retry-draw">${g.turn>1?'重试改画':'重试画图'}</button><div class="button-row"><button data-action="reveal-confirm">跳过本题</button>${g.drawErrorKind==='format'?'':'<button data-action="settings">检查 AI 设置</button>'}</div>`;
  if(g.phase==='reveal') {const solved=Object.values(g.results).filter(r=>r.solved).length;html=`<h3>答案揭晓</h3><div class="answer">${esc(g.answer)}</div><p>${solved} / ${Object.keys(g.results).length} 位猜中<br>画手本题得 <b>${g.roundGain}</b> 分</p>${banterMarkup(g.banter)}<button class="primary" data-action="next">${banterPending(g.banter)?'跳过剩余互动，':''}${g.index+1===g.total?'查看比赛总结':'下一题'}</button>`;}
  if(g.notice&&g.phase!=='draw-error'&&g.phase!=='guessing')html+=`<p class="error-message">${esc(g.notice)}</p>`;
  if(g.phase==='reveal'&&g.recap)html+=`<p class="recap-intro">这题无人猜中，${g.recap.status==='loading'?'大家正在整理复盘…':'复盘已存入对局聊天。'}</p>${recapMarkup(g.recap)}`;
  const scope=JSON.stringify([g.id,g.index,g.turn,g.phase]),keepDraft=scope===actionDraftScope;
  const drafts=keepDraft?[...$('actionPanel').querySelectorAll('textarea[data-hint-text],select[data-hint-region],select[data-hint-focus],#guessInput')].map(input=>({id:input.id,recipient:input.closest('[data-hint-recipient]')?.dataset.hintRecipient,field:input.hasAttribute('data-hint-region')?'region':input.hasAttribute('data-hint-focus')?'focus':'text',value:input.value,focused:input===document.activeElement,start:input.selectionStart,end:input.selectionEnd})):[];
  const privateOpen=keepDraft&&$('actionPanel').querySelector('.private-hints')?.open;
  const recapOpen=$('actionPanel').querySelector('.round-recap')?.open;
  const banterDraft=captureBanterDraft($('actionPanel'));
  $('actionPanel').innerHTML=html;
  restoreBanterDraft($('actionPanel'),banterDraft);
  actionDraftScope=scope;
  if(privateOpen&&$('actionPanel').querySelector('.private-hints'))$('actionPanel').querySelector('.private-hints').open=true;
  for(const draft of drafts){const input=[...$('actionPanel').querySelectorAll('textarea[data-hint-text],select[data-hint-region],select[data-hint-focus],#guessInput')].find(input=>draft.id?input.id===draft.id:input.closest('[data-hint-recipient]')?.dataset.hintRecipient===draft.recipient&&(input.hasAttribute('data-hint-region')?'region':input.hasAttribute('data-hint-focus')?'focus':'text')===draft.field);if(input){input.value=draft.value;if(draft.focused){input.focus({preventScroll:true});if(input.setSelectionRange)input.setSelectionRange(draft.start,draft.end);}}}
  for(const row of $('actionPanel').querySelectorAll('[data-hint-recipient]')){const preview=row.querySelector('[data-hint-preview]');if(preview){try{preview.textContent=visualHint(readHintChoice(row),localShapes,currentHintMode).text||'不发送提示';}catch(error){preview.textContent=error.message;}}}
  if(recapOpen&&$('actionPanel').querySelector('.round-recap'))$('actionPanel').querySelector('.round-recap').open=true;
  const form=$('guessForm');if(form)form.onsubmit=e=>{e.preventDefault();const input=$('guessInput'),value=input.value.trim();if(!value)return;form.querySelector('button').disabled=true;act('guess',{guess:value});};
}
$('actionPanel').onclick=async e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
  if(game?.mode==='relay'){
    const g=game,task=g.relay.myTask,extra={stage:g.index,chainId:task?.chainId};
    if(a==='relay-draw-submit'){if(currentStroke||inFlight)return;if(!localShapes.length)return toast('先在画布上画几笔。');b.disabled=true;await act('relay-submit',{...extra,shapes:localShapes});}
    else if(a==='relay-pass'){b.disabled=true;await act('relay-submit',{...extra,pass:true});}
    else {b.disabled=true;await act(a,extra);}
    if(b.isConnected)b.disabled=false;return;
  }
  if(a==='submit'){submitCanvas();return;}
  if(a==='settings'){openSettings();return;}
  if(a==='reveal-confirm'){if(await confirmAction('结束这一题？','会公布答案，未猜中的选手不再获得本题分数。','公布答案'))act('reveal');return;}
  b.disabled=true;await act(a);if(b.isConnected)b.disabled=false;
};
$('finishButton').onclick=async()=>{const relay=game?.mode==='relay';if(await confirmAction(relay?'提前结束接龙？':'结束比赛？',relay?'公开所有已经交卷的内容；还在进行的棒次会停止。':'保留得分和已经完成的画作，查看比赛总结。',relay?'结束并查看总结':'结束并查看总结'))act('finish');};
function renderGuessers(){
  const g=game,entries=Object.values(g.results),solved=entries.filter(r=>r.solved).length;
  $('guessProgress').textContent=`${solved} / ${entries.length} 已猜中`;
  playerSeats.update(g,animating);
  $('privacyNote').textContent=g.phase==='reveal'?'本题结束，所有答案已公开。':g.artistHuman?'画手可以参考错误答案来改画。':!g.players.some(p=>p.human)?'观战中：已判分的猜词与理由会显示在气泡和聊天中。':'其他选手的答案将在本题结束后公开。';
}
const COLORS=['#202633','#db2450','#f09524','#f3ca24','#30a357','#2983c7','#415ed1','#8150ca','#895b33','#e979ab','#ffffff'];
$('colors').innerHTML=COLORS.map((c,i)=>`<button class="swatch ${i===0?'selected':''}" style="background:${c}" data-color="${c}" aria-label="${['黑色','红色','橙色','黄色','绿色','蓝色','靛蓝','紫色','棕色','粉色','白色'][i]}" aria-pressed="${i===0}"></button>`).join('');
$('colors').onclick=e=>{const b=e.target.closest('[data-color]');if(!b)return;color=b.dataset.color;erasing=false;updateTools();};
function updateTools(){document.querySelectorAll('.swatch').forEach(b=>{const on=!erasing&&b.dataset.color===color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});$('eraserButton').classList.toggle('selected',erasing);$('eraserButton').setAttribute('aria-pressed',erasing);}
$('eraserButton').onclick=()=>{erasing=!erasing;updateTools();};
function canDraw(){return game?.mode==='relay'?game.phase==='relay-work'&&game.relay.myTask?.kind==='draw'&&game.relay.myTask.status==='waiting'&&!!game.relay.myTask.input:game?.artistHuman&&game.phase==='drawing';}
function undo(){if(canDraw()&&!currentStroke){localShapes=drawingHistory.undo(localShapes);paint(canvas,localShapes);}}
$('undoButton').onclick=undo;
$('clearButton').onclick=()=>{if(canDraw()&&!currentStroke&&localShapes.length){localShapes=drawingHistory.clear(localShapes);paint(canvas,localShapes);}};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();undo();}});
function point(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(W,Math.round((e.clientX-b.left)*W/b.width))),Math.max(0,Math.min(H,Math.round((e.clientY-b.top)*H/b.height)))];}
canvas.onpointerdown=e=>{if(!canDraw()||localShapes.length>=440||currentStroke)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drawingHistory.stroke(localShapes.length);const p=point(e);currentStroke={type:'line',points:[p,[p[0]+(p[0]<1000?.01:0),p[1]]],color:erasing?'#ffffff':color,width:erasing?24:+$('brushSize').value};localShapes.push(currentStroke);drawShape(canvas.getContext('2d'),currentStroke);};
canvas.onpointermove=e=>{if(!currentStroke)return;e.preventDefault();for(const v of e.getCoalescedEvents?.()||[e]){const p=point(v),last=currentStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<1)continue;if(currentStroke.points.length>=1700){const s={...currentStroke,points:[last,p]};localShapes.push(s);currentStroke=s;}else currentStroke.points.push(p);drawShape(canvas.getContext('2d'),{...currentStroke,points:[last,p]});}};
const endStroke=()=>{currentStroke=null;};canvas.onpointerup=endStroke;canvas.onpointercancel=endStroke;canvas.onlostpointercapture=endStroke;

function renderResults(){
  if(resultKey!==game.id){
    resultKey=game.id;
    if(game.mode==='relay')renderRelayResults($('results'),game,act);
    else renderBattleSummary($('results'),game,act);
    window.scrollTo({top:0,behavior:'instant'});
  }
  if(game.mode==='relay')updateRelayReviews($('results'),game,act);
}

const openSettings=mountSettings(settings,{
  onChange({selectionChanged=false}={}){
    config.players=settings.list();
    if(selectionChanged){
      const defaults=config.players.filter(p=>p.enabled&&p.ready).map(p=>p.id);
      if(mode==='duel'){
        groupSelection=new Set(defaults);
        selected=new Set(defaults.slice(0,1));
      }else selected=new Set(defaults);
    }
    renderLobby();
  },
  toast
});
$('settingsButton').onclick=openSettings;
$('closeRelayPicture').onclick=()=>$('relayPictureDialog').close();
selected=new Set(config.players.filter(player=>player.enabled).map(player=>player.id));
renderLobby();
$('startButton').disabled=false;
$('settingsButton').disabled=false;
