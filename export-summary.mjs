import {paint} from './drawing.mjs';
import {createPlayerAvatar} from './player-avatar.mjs';

// 把比赛总结画成一张长图，按题列出画画和猜词的过程。
const W=1000,PAD=36,CARD_PAD=24,IMG_W=440,IMG_H=286,GAP=24;

function wrap(ctx,text,maxWidth){
  const lines=[];
  for(const para of String(text??'').split('\n')){
    let line='';
    for(const ch of Array.from(para)){
      if(line&&ctx.measureText(line+ch).width>maxWidth){lines.push(line);line=ch;}else line+=ch;
    }
    lines.push(line);
  }
  return lines;
}

function guessLines(round,attempt,players){
  const out=[];
  for(const player of players){
    const entry=round.results[player.id]?.history.find(g=>g.turn===attempt.turn);
    if(!entry)continue;
    const status=entry.skipped?'跳过':entry.correct?`猜中 +${entry.points} 分`:'未猜中';
    out.push({name:player.name,guess:entry.skipped?'':entry.guess,status,tone:entry.skipped?'skip':entry.correct?'ok':'bad',reason:entry.skipped?'':entry.reason||''});
  }
  return out;
}

function drawHeader(ctx,family){
  ctx.fillStyle='#faf8ff';ctx.fillRect(0,0,W,1e5);
  ctx.textBaseline='alphabetic';
  ctx.font=`bold 18px ${family}`;ctx.fillStyle='#3b2649';ctx.fillText('AI 你画我猜',PAD,46);
}

async function loadAvatars(players){
  const entries=await Promise.all(players.map(async player=>{
    const avatar=createPlayerAvatar(player);
    const portrait=avatar.querySelector('img');
    const image=portrait||new Image();
    if(!portrait){
      const ghost=avatar.querySelector('svg');
      ghost.setAttribute('xmlns','http://www.w3.org/2000/svg');
      image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(ghost.outerHTML);
    }
    try{await image.decode();return [player.id,{image,ghost:!portrait}];}
    catch{return [player.id,null];}
  }));
  return new Map(entries);
}

function drawAvatar(ctx,avatar,x,y,size){
  if(!avatar)return;
  const {image,ghost}=avatar;
  ctx.save();
  ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();
  ctx.fillStyle=ghost?'#fdebf0':'#eef1ff';ctx.fillRect(x,y,size,size);
  if(ghost)ctx.drawImage(image,x+size*.16,y+size*.16,size*.68,size*.68);
  else{
    const crop=Math.min(image.naturalWidth,image.naturalHeight);
    ctx.drawImage(image,(image.naturalWidth-crop)/2,(image.naturalHeight-crop)/2,crop,crop,x,y,size,size);
  }
  ctx.restore();
  ctx.strokeStyle='#cbd6ea';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.stroke();
}

function avatarRows(ctx,entries,width,{font,color,size,lineHeight},avatars){
  const gap=8,entryGap=16;
  const rows=[];
  let row={items:[],width:0,height:0};
  ctx.font=font;
  for(const {id,label} of entries){
    const avatar=avatars.get(id);
    const reserved=avatar?size+gap:0;
    const lines=wrap(ctx,label,width-reserved);
    const textWidth=Math.max(...lines.map(line=>ctx.measureText(line).width));
    const itemWidth=textWidth+reserved;
    if(row.items.length&&row.width+entryGap+itemWidth>width){
      rows.push(row);row={items:[],width:0,height:0};
    }
    const x=row.width+(row.items.length?entryGap:0);
    row.items.push({avatar,lines,textWidth,x});
    row.width=x+itemWidth;
    row.height=Math.max(row.height,lines.length*lineHeight);
  }
  if(row.items.length)rows.push(row);
  return {
    width:Math.max(0,...rows.map(row=>row.width)),
    height:rows.reduce((height,row)=>height+row.height,0),
    paint(x,y){
      ctx.font=font;ctx.textBaseline='middle';
      for(const row of rows){
        for(const item of row.items){
          ctx.fillStyle=color;
          item.lines.forEach((line,index)=>ctx.fillText(line,x+item.x,y+(index+.5)*lineHeight));
          drawAvatar(ctx,item.avatar,x+item.x+item.textWidth+gap,y+(lineHeight-size)/2,size);
        }
        y+=row.height;
      }
    }
  };
}

function relayText(ctx,value,width,font,color,lineHeight){
  ctx.font=font;
  const lines=wrap(ctx,value,width);
  return {
    height:lines.length*lineHeight,
    paint(x,y){
      ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='middle';
      lines.forEach((line,i)=>ctx.fillText(line,x,y+(i+.5)*lineHeight));
    }
  };
}

function relayStack(blocks,gap){
  return {
    height:blocks.reduce((sum,block)=>sum+block.height,0)+Math.max(0,blocks.length-1)*gap,
    paint(x,y){
      for(const block of blocks){block.paint(x,y);y+=block.height+gap;}
    }
  };
}

function relayRow(items,gap){
  return {
    height:Math.max(0,...items.map(({block})=>block.height)),
    paint(x,y){
      for(const {block,width} of items){block.paint(x,y);x+=width+gap;}
    }
  };
}

function relayBox(ctx,block,width,pad,fill,border,radius=9){
  const height=block.height+2*pad;
  return {
    height,
    paint(x,y){
      ctx.fillStyle=fill;ctx.strokeStyle=border;ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.fill();ctx.stroke();
      block.paint(x+pad,y+pad);
    }
  };
}

function relayStep(ctx,step,label,width,family,detail,drawing){
  const heading=relayText(ctx,label,width,'bold 13px '+family,'#6247ab',18);
  if(step?.kind==='draw'&&!step.skipped){
    const height=Math.round(width*0.65);
    return relayStack([heading,{
      height,
      paint(x,y){
        paint(drawing,step.shapes);
        ctx.drawImage(drawing,x,y,width,height);
        ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1;ctx.strokeRect(x,y,width,height);
      }
    }],4);
  }
  const word=step?.skipped?'这一棒留空':step?.text||'未完成';
  const reason=detail?(step?.skipped?step.skipReason:step?.reason):'';
  const pad=10,bodyWidth=width-2*pad;
  const content=[relayText(ctx,word,bodyWidth,'bold 19px '+family,step?.text?'#314aa0':'#66758b',24)];
  if(reason)content.push(relayText(ctx,reason,bodyWidth,'13px '+family,'#55647a',18));
  return relayStack([heading,relayBox(ctx,relayStack(content,4),width,pad,'#f8f5ff','#e4dcf3')],4);
}

function relayAssessment(ctx,game,ballot,width,family,full,name){
  const verdict=ballot?.verdict;
  const passed=verdict?.passed;
  let label=ballot?.status==='pass-vote'?'投票进行中':'尚未投票';
  if(verdict?.automatic)label='首尾词一致，自动通过';
  else if(verdict)label=passed===null?'无人投出有效票':passed?'接龙通过':'接龙不通过';
  const color=passed?'#257451':passed===false?'#9b492a':'#55647a';
  const text=(value,size,tone='#55647a',bold=false)=>relayText(ctx,value,width-24,(bold?'bold ':'')+size+'px '+family,tone,size+6);
  const blocks=[text(label,17,color,true)];
  if(verdict&&!verdict.automatic){
    const counts=[verdict.yes+' 票通过',verdict.no+' 票不通过'];
    if(verdict.abstained)counts.push(verdict.abstained+' 票弃权');
    if(verdict.yes&&verdict.yes===verdict.no)counts.push('平票不通过');
    blocks.push(text(counts.join(' · '),13));
    if(ballot.culprits){
      const {winners,highest}=ballot.culprits;
      blocks.push(text(winners.length?'最大害群之马 · '+winners.map(name).join('、')+' · '+highest+' 票':'偏离原因投票无人投出有效票',13,color,true));
    }
    const votes=(records,kind,title)=>{
      const entries=game.players.flatMap(player=>{
        const vote=records?.[player.id];
        let choice='';
        if(vote?.status==='abstained')choice='弃权';
        else if(vote?.status==='submitted'){
          if(kind==='pass'&&typeof vote.pass==='boolean')choice=vote.pass?'通过':'不通过';
          if(kind==='culprit'&&vote.targetId)choice='投给 '+name(vote.targetId);
        }
        if(!choice||(!full&&!vote.reason))return [];
        return [{label:name(player.id)+(full?' · '+choice:''),reason:vote.reason}];
      });
      if(!entries.length)return;
      const gap=14,columns=entries.length<=4?Math.min(entries.length,2):3;
      const cellWidth=Math.floor((width-24-(columns-1)*gap)/columns);
      const rows=[];
      for(let i=0;i<entries.length;i+=columns){
        rows.push(relayRow(entries.slice(i,i+columns).map(entry=>{
          const parts=[relayText(ctx,entry.label,cellWidth,'bold 13px '+family,'#39476b',18)];
          if(entry.reason)parts.push(relayText(ctx,entry.reason,cellWidth,'13px '+family,'#55647a',18));
          return {block:relayStack(parts,2),width:cellWidth};
        }),gap));
      }
      blocks.push(relayStack([text(title,13,'#39476b',true),relayStack(rows,9)],4));
    };
    votes(ballot.passVotes,'pass',full?'通过 / 不通过投票':'通过 / 不通过的理由');
    if(ballot.culprits)votes(ballot.culpritVotes,'culprit',full?'最大害群之马投票':'偏离原因投票的理由');
  }
  return relayBox(ctx,relayStack(blocks,8),width,12,'#f8f5ff','#ded7ed');
}

function relayInteraction(ctx,game,ballot,width,family,name){
  const sections=[];
  const text=(value,size,bold=false)=>relayText(ctx,value,width-24,(bold?'bold ':'')+size+'px '+family,bold?'#784526':'#594333',size+6);
  const reflections=game.players.flatMap(p=>{
    const note=ballot?.reflections?.[p.id];
    return note?.status==='submitted'&&note.text?[text(name(p.id)+' · '+note.text,13)]:[];
  });
  if(reflections.length)sections.push(relayStack([text('通关感言',15,true),...reflections],4));
  const exchanges=ballot?.banter?.exchanges||[];
  const messages=exchanges.flatMap(e=>{
    const from=e.fromName||name(e.fromId),to=e.toName||name(e.toId);
    const message=(speaker,recipient,body)=>relayStack([text(speaker+' → '+recipient,13,true),text(body,14)],1);
    const pair=[];
    if(e.opener)pair.push(message(from,to,e.opener));
    if(e.reply)pair.push(message(to,from,e.reply));
    return pair.length?[relayStack(pair,6)]:[];
  });
  if(messages.length)sections.push(relayStack([text('赛后互动',15,true),...messages],7));
  return sections.length?relayBox(ctx,relayStack(sections,10),width,12,'#fff8ef','#ebd7c3'):null;
}

function layoutRelay(ctx,game,family,draw,avatars,level){
  const name=id=>game.players.find(p=>p.id===id)?.name||'未知选手';
  const detail=level!=='process',full=level==='full';
  const innerWidth=W-2*(PAD+CARD_PAD),pairGap=20,stepGap=10;
  const drawing=draw?document.createElement('canvas'):null;
  if(draw){drawing.width=1000;drawing.height=650;drawHeader(ctx,family);}
  let y=72;
  for(const [ci,chain] of game.chains.entries()){
    const title=avatarRows(ctx,[{id:chain.ownerId,label:(ci+1)+'. '+name(chain.ownerId)+' 的接龙'}],Math.floor(innerWidth*.56),
      {font:'bold 22px '+family,color:'#182443',size:30,lineHeight:34},avatars);
    const topicX=title.width+18,topicLabel='原始题目 · '+chain.answer;
    const topicFont='bold 17px '+family;
    ctx.font=topicFont;
    const topicWidth=Math.min(innerWidth-topicX,Math.ceil(ctx.measureText(topicLabel).width)+14);
    const topic=relayText(ctx,topicLabel,topicWidth-14,topicFont,'#314aa0',24);
    const topicBox=relayBox(ctx,topic,topicWidth,7,'#eee8fb','#e0d6f4',8);
    const header={
      height:Math.max(title.height,topicBox.height),
      paint(x,y){
        title.paint(x,y+(this.height-title.height)/2);
        topicBox.paint(x+topicX,y+(this.height-topicBox.height)/2);
      }
    };
    const route=relayText(ctx,'传递顺序 · '+chain.route.map(name).join(' → '),innerWidth,'13px '+family,'#55647a',18);
    const pairs=[],colCount=chain.route.length>2?2:1,pairWidth=(innerWidth-(colCount-1)*pairGap)/colCount;
    const artWidth=Math.round(pairWidth*(colCount===2?.62:.49));
    for(let pos=0;pos<chain.route.length;pos+=2){
      const label=i=>'第 '+(i+1)+' 棒 · '+(i%2?'猜词':'画图')+' · '+name(chain.route[i]);
      const pair=[{block:relayStep(ctx,chain.steps[pos],label(pos),artWidth,family,detail,drawing),width:artWidth}];
      if(pos+1<chain.route.length){
        const wordWidth=pairWidth-artWidth-stepGap;
        pair.push({block:relayStep(ctx,chain.steps[pos+1],label(pos+1),wordWidth,family,detail,drawing),width:wordWidth});
      }
      pairs.push(relayRow(pair,stepGap));
    }
    const rows=[];
    for(let i=0;i<pairs.length;i+=colCount){
      rows.push(relayRow(pairs.slice(i,i+colCount).map(block=>({block,width:pairWidth})),pairGap));
    }
    const blocks=[relayStack([header,route],4),relayStack(rows,12)];
    const ballot=game.relay?.reviews?.[ci];
    if(detail)blocks.push(relayAssessment(ctx,game,ballot,innerWidth,family,full,name));
    if(full){
      const interaction=relayInteraction(ctx,game,ballot,innerWidth,family,name);
      if(interaction)blocks.push(interaction);
    }
    const card=relayBox(ctx,relayStack(blocks,12),W-PAD*2,CARD_PAD,'#fff','#ddd5f0',16);
    if(draw)card.paint(PAD,y);
    y+=card.height+16;
  }
  return y+PAD-16;
}

function layout(ctx,game,family,draw,avatars){
  const text=(s,x,y,font,color)=>{ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.fillText(s,x,y);};
  const innerW=W-2*(PAD+CARD_PAD),textX=PAD+CARD_PAD+IMG_W+GAP,textW=W-PAD-CARD_PAD-textX;
  if(draw)drawHeader(ctx,family);
  let y=84;
  // 冠军
  {
    const ranking=[...game.players].sort((a,b)=>b.total-a.total);
    const best=ranking[0]?.total??0;
    const champs=avatarRows(ctx,ranking.filter(p=>p.total===best).map(p=>({id:p.id,label:p.name})),innerW-90,
      {font:`bold 26px ${family}`,color:'#314aa0',size:32,lineHeight:38},avatars);
    const board=avatarRows(ctx,ranking.map((p,i)=>({id:p.id,label:`${i+1}. ${p.name} ${p.total} 分`})),innerW,
      {font:`14px ${family}`,color:'#72809a',size:22,lineHeight:28},avatars);
    const h=CARD_PAD+18+champs.height+8+board.height+CARD_PAD;
    if(draw){
      ctx.fillStyle='#fffdf6';ctx.strokeStyle='#e2c46a';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(PAD,y,W-PAD*2,h,16);ctx.fill();ctx.stroke();
      text('总冠军',PAD+CARD_PAD,y+CARD_PAD+8,`bold 13px ${family}`,'#a27b12');
      const cy=y+CARD_PAD+18;
      champs.paint(PAD+CARD_PAD,cy);
      ctx.font=`bold 20px ${family}`;
      text(`${best} 分`,W-PAD-CARD_PAD-ctx.measureText(`${best} 分`).width,cy+26,`bold 20px ${family}`,'#a27b12');
      board.paint(PAD+CARD_PAD,cy+champs.height+8);
    }
    y+=h+20;
  }
  for(const round of game.history){
    const top=y;
    const title=avatarRows(ctx,[{id:round.artistId,label:`第 ${round.index+1} 题 · ${round.answer}`}],innerW,
      {font:`bold 22px ${family}`,color:'#182443',size:30,lineHeight:34},avatars);
    // 先量出这一题要多高
    const attemptsTop=top+CARD_PAD+title.height+34;
    let h=attemptsTop-top;
    const blocks=round.attempts.map(attempt=>{
      ctx.font=`13px ${family}`;
      const hint=attempt.hint?wrap(ctx,`公开提示 · ${attempt.hint}`,textW):[];
      const guesses=guessLines(round,attempt,game.players).map(g=>{
        ctx.font=`bold 15px ${family}`;const head=wrap(ctx,`${g.name} · ${g.guess?g.guess+' · ':''}${g.status}`,textW);
        ctx.font=`13px ${family}`;const reason=g.reason?wrap(ctx,g.reason,textW-12):[];
        return {...g,head,reason};
      });
      let th=hint.length*20+(hint.length?8:0);
      for(const g of guesses)th+=g.head.length*22+g.reason.length*19+10;
      if(!guesses.length)th+=20;
      return {attempt,hint,guesses,height:Math.max(IMG_H+30,th+30)};
    });
    for(const b of blocks)h+=b.height+14;
    if(!blocks.length)h+=24;
    h+=CARD_PAD-14;
    if(draw){
      ctx.fillStyle='#fff';ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(PAD,top,W-PAD*2,h,16);ctx.fill();ctx.stroke();
      title.paint(PAD+CARD_PAD,top+CARD_PAD);
      text(`${round.artistName} 作画 · +${round.drawGain} 分`,PAD+CARD_PAD,top+CARD_PAD+title.height+16,`14px ${family}`,'#72809a');
    }
    let by=attemptsTop;
    for(const b of blocks){
      if(draw){
        text(`第 ${b.attempt.turn} 版画作`,PAD+CARD_PAD,by+16,`bold 14px ${family}`,'#6a4bd0');
        const cv=document.createElement('canvas');cv.width=1000;cv.height=650;paint(cv,b.attempt.shapes);
        const ix=PAD+CARD_PAD,iy=by+26;
        ctx.drawImage(cv,ix,iy,IMG_W,IMG_H);
        ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1;ctx.strokeRect(ix,iy,IMG_W,IMG_H);
        let ty=by+20;
        for(const l of b.hint){text(l,textX,ty,`13px ${family}`,'#72809a');ty+=20;}
        if(b.hint.length)ty+=8;
        for(const g of b.guesses){
          const color=g.tone==='ok'?'#258458':g.tone==='bad'?'#c43959':'#72809a';
          for(const l of g.head){text(l,textX,ty,`bold 15px ${family}`,color);ty+=22;}
          for(const l of g.reason){text(l,textX+12,ty,`13px ${family}`,'#66758b');ty+=19;}
          ty+=10;
        }
        if(!b.guesses.length)text('这版画作暂无已提交的猜词。',textX,ty,`13px ${family}`,'#72809a');
      }
      by+=b.height+14;
    }
    if(!blocks.length&&draw)text('本题暂无已完成的画作。',PAD+CARD_PAD,attemptsTop+20,`14px ${family}`,'#72809a');
    y=top+h+20;
  }
  return y+PAD-20;
}

export async function buildSummaryImage(game,level='process'){
  try{await document.fonts.ready;}catch{}
  const avatars=await loadAvatars(game.players);
  const family=getComputedStyle(document.body).fontFamily||'sans-serif';
  const probe=document.createElement('canvas').getContext('2d');
  const run=game.chains?layoutRelay:layout;
  const height=Math.ceil(run(probe,game,family,false,avatars,level));
  const scale=Math.min(2,30000/height);
  const canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.fillStyle='#faf8ff';ctx.fillRect(0,0,W,height);
  run(ctx,game,family,true,avatars,level);
  return canvas;
}

export function bindSummaryExport(button,game,{getGame=()=>game,levelSelect}={}){
  button.onclick=async()=>{
    const current=getGame();
    if(!current||current.id!==game.id)return;
    const level=levelSelect?.value;
    button.disabled=true;button.textContent='生成中…';
    if(levelSelect)levelSelect.disabled=true;
    try{await exportSummaryImage(current,level);button.textContent='导出长图';}
    catch{button.textContent='导出失败，再试一次';}
    finally{
      button.disabled=false;
      if(levelSelect)levelSelect.disabled=false;
    }
  };
}

async function exportSummaryImage(game,level){
  const date=new Date(),pad=n=>String(n).padStart(2,'0');
  const stamp=`${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const canvas=await buildSummaryImage(game,level);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
  if(blob?.type!=='image/jpeg')throw new Error('生成 JPG 失败');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`aidraw-${game.chains?'接龙':'比赛'}-${stamp}.jpg`;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
