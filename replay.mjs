import {paint} from './drawing.mjs';
import {createPlayerAvatar} from './player-avatar.mjs';
import {drawingTransition,partialStroke,strokeDuration,animateProgress} from './drawing-playback.mjs';

// 回放：用比赛结束后的结果重放一遍，画笔一笔笔画出来，猜词逐条出现。
const WAIT={slow:1.6,normal:1,fast:.4};

function person(player){
  const box=document.createElement('span');
  box.className='replay-person';
  const name=document.createElement('b');
  name.textContent=player.name;
  box.append(createPlayerAvatar(player),name);
  return box;
}

function mount(scenes){
  const dialog=document.createElement('dialog');
  dialog.id='replayDialog';
  dialog.setAttribute('aria-label','回放');
  dialog.innerHTML=`<div class="replay-box">
    <header><div><div class="replay-title"><strong data-head></strong><span data-owner></span></div><span data-sub></span></div><button type="button" data-close aria-label="关闭回放">×</button></header>
    <canvas width="1500" height="975" data-canvas role="img" aria-label="回放画布"></canvas>
    <ul class="replay-lines" data-lines aria-live="polite"></ul>
    <footer><button type="button" data-prev>上一步</button><button type="button" class="primary" data-play>暂停</button><button type="button" data-next>下一步</button>
      <div class="replay-pass" data-pass hidden></div><select data-speed aria-label="回放速度"><option value="slow">慢</option><option value="normal" selected>正常</option><option value="fast">快</option></select><span data-count></span></footer>
  </div>`;
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),canvas=q('[data-canvas]'),lines=q('[data-lines]'),play=q('[data-play]');
  let index=0,token=0,playing=true,running=false;
  const speed=()=>q('[data-speed]').value;
  const frame=t=>async()=>{let time;do{time=await new Promise(requestAnimationFrame);}while(!playing&&t===token);return time;};
  const sleep=async(ms,t)=>{let left=ms*WAIT[speed()];while(left>0){if(t!==token)return false;await new Promise(r=>setTimeout(r,50));if(playing)left-=50;}return t===token;};

  function addLine(line){
    const li=document.createElement('li');
    if(line.tone)li.className=line.tone;
    const name=document.createElement('b'),text=document.createElement('span');
    name.textContent=line.name;text.textContent=line.text;
    if(line.player)li.append(createPlayerAvatar(line.player));
    li.append(name,text);
    if(line.reason){const small=document.createElement('small');small.textContent=line.reason;li.append(small);}
    lines.append(li);lines.scrollTop=lines.scrollHeight;
  }

  // instant：暂停时手动切换步骤，直接显示完整内容。
  async function show(i,instant=false){
    const t=++token;running=!instant;
    index=Math.max(0,Math.min(scenes.length-1,i));
    const scene=scenes[index];
    q('[data-head]').textContent=scene.head;
    q('[data-sub]').textContent=scene.sub||'';
    q('[data-owner]').replaceChildren(...(scene.owner?[createPlayerAvatar(scene.owner)]:[]));
    const pass=q('[data-pass]'),arrow=document.createElement('i');
    arrow.textContent='→';arrow.setAttribute('aria-hidden','true');
    pass.hidden=!(scene.from&&scene.to?.length);
    pass.replaceChildren(...(pass.hidden?[]:[person(scene.from),arrow,...scene.to.map(person)]));
    q('[data-count]').textContent=`${index+1} / ${scenes.length}`;
    lines.replaceChildren();
    if(instant){paint(canvas,scene.shapes);(scene.lines||[]).forEach(addLine);return;}
    const previous=scene.previous||[],plan=drawingTransition(previous,scene.shapes),shown=previous.slice(0,plan.keep);
    paint(canvas,shown);
    for(const shape of plan.append){
      const done=await animateProgress(strokeDuration(shape,speed()),{draw:p=>paint(canvas,[...shown,partialStroke(shape,p)]),isActive:()=>t===token,frame:frame(t)});
      if(!done)return;
      shown.push(shape);
    }
    paint(canvas,scene.shapes);
    for(const line of scene.lines||[]){
      if(!await sleep(700,t))return;
      addLine(line);
    }
    if(!await sleep(1400,t))return;
    running=false;
    if(index<scenes.length-1)void show(index+1);
    else{playing=false;play.textContent='重播';}
  }

  const close=()=>{token++;playing=false;if(dialog.open)dialog.close();dialog.remove();};
  q('[data-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  q('[data-prev]').onclick=()=>void show(index-1,!playing);
  q('[data-next]').onclick=()=>void show(index+1,!playing);
  play.onclick=()=>{
    if(play.textContent==='重播'){playing=true;play.textContent='暂停';void show(0);return;}
    playing=!playing;play.textContent=playing?'暂停':'播放';
    // 暂停时手动翻过步骤后再播放：从下一步接着放。
    if(playing&&!running)void show(index<scenes.length-1?index+1:0);
  };
  dialog.showModal();
  void show(0);
}

export function openBattleReplay(game){
  const scenes=[],find=id=>game.players.find(p=>p.id===id),name=id=>find(id)?.name||'未知选手';
  game.history.forEach((round,r)=>{
    const artist=find(round.artistId);
    const head=`第 ${r+1} / ${game.total} 题 · 画手 ${round.artistName||name(round.artistId)}`;
    round.attempts.forEach((attempt,k)=>{
      const lines=game.players.flatMap(player=>{
        const entry=round.results[player.id]?.history.find(guess=>guess.turn===attempt.turn);
        if(!entry)return [];
        if(entry.skipped)return [{name:player.name,player,text:'这次先跳过'}];
        return [{name:player.name,player,text:`猜「${entry.guess}」 · ${entry.correct?'猜中 +'+entry.points+' 分':'没猜中'}`,reason:entry.reason,tone:entry.correct?'hit':'miss'}];
      });
      const guessers=lines.map(line=>line.player).filter(Boolean);
      scenes.push({head,owner:artist,from:artist,to:guessers,sub:`第 ${attempt.turn} 版画作${attempt.hint?' · 公开提示：'+attempt.hint:''}`,previous:k?round.attempts[k-1].shapes:[],shapes:attempt.shapes,lines});
    });
    const last=round.attempts.at(-1)?.shapes||[],solved=Object.values(round.results).filter(result=>result.solved).length;
    scenes.push({head,owner:artist,sub:'答案揭晓',previous:last,shapes:last,lines:[
      {name:'答案',text:round.answer,tone:'answer'},
      {name:'结果',text:`${solved} / ${Object.keys(round.results).length} 位猜中，画手得 ${round.drawGain||0} 分`}
    ]});
  });
  const ranking=[...game.players].sort((a,b)=>b.total-a.total);
  scenes.push({head:'比赛结束',sub:'最终得分',shapes:[],lines:ranking.map((player,i)=>({name:`${i+1}`,text:`${player.name} · ${player.total} 分`,tone:i===0?'answer':''}))});
  mount(scenes);
}

export function openRelayReplay(game){
  const scenes=[],find=id=>game.players.find(p=>p.id===id),name=id=>find(id)?.name||'未知选手';
  game.chains.forEach((chain,c)=>{
    const owner=find(chain.ownerId);
    const head=`第 ${c+1} / ${game.chains.length} 条链 · ${name(chain.ownerId)} 的接龙`;
    let picture=[];
    chain.route.forEach((id,position)=>{
      const step=chain.steps[position];
      if(!step)return;
      const who=name(step.playerId||id),before=chain.steps[position-1],sender=position?find(chain.route[position-1]):null,receiver=find(step.playerId||id),pass=sender&&receiver?{from:sender,to:[receiver]}:{};
      if(step.kind==='draw'){
        const word=position===0?chain.answer:before?.kind==='guess'&&!before.skipped?before.text:null;
        const shapes=step.skipped?[]:step.shapes||[];
        scenes.push({head,owner,...pass,sub:`第 ${position+1} 棒 · ${who} 画的：${step.skipped?'这一棒留空':word||'未收到词语'}`,previous:[],shapes});
        if(!step.skipped)picture=shapes;
      }else{
        scenes.push({head,owner,...pass,sub:`第 ${position+1} 棒 · ${who} 猜词`,previous:picture,shapes:picture,
          lines:[step.skipped?{name:who,player:receiver,text:'这一棒留空'}:{name:who,player:receiver,text:`猜「${step.text}」`,reason:step.reason}]});
      }
    });
    const last=chain.steps.filter(Boolean).at(-1),ending=!last?'尚未交卷':last.skipped?'后续留空':last.kind==='draw'?'以画作收尾':last.text;
    const same=last?.kind==='guess'&&!last.skipped&&last.text===chain.answer;
    scenes.push({head,owner,sub:'传到最后',previous:picture,shapes:picture,lines:[
      {name:'原题',text:chain.answer,tone:'answer'},
      {name:'最后',text:ending,tone:same?'hit':'miss'},
      {name:'结果',text:same?'一字不差传回来了':'中途走样了'}
    ]});
  });
  mount(scenes);
}
