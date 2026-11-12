import {paint} from './drawing.mjs';

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

function layoutRelay(ctx,game,family,draw){
  const text=(t,x,y,font,color)=>{ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.fillText(t,x,y);};
  const name=id=>game.players.find(p=>p.id===id)?.name||'未知选手';
  if(draw)drawHeader(ctx,family);
  let y=84;
  const COLG=20,cellW=(W-PAD*2-CARD_PAD*2-COLG)/2,cellH=Math.round(cellW*0.65);
  game.chains.forEach((chain,ci)=>{
    const cells=[{label:'原始题目',kind:'origin',text:chain.answer}];
    chain.route.forEach((id,pos)=>{
      const step=chain.steps[pos],kind=pos%2?'猜词':'画图';
      cells.push({label:`第 ${pos+1} 棒 · ${kind} · ${name(id)}`,kind:!step?'none':step.skipped?'skip':step.kind==='draw'?'draw':'guess',step});
    });
    ctx.font=`14px ${family}`;
    const route=wrap(ctx,`传递顺序 · ${chain.route.map(name).join(' → ')}`,W-PAD*2-CARD_PAD*2);
    const rows=[];
    for(let i=0;i<cells.length;i+=2){
      const pair=cells.slice(i,i+2).map(c=>{
        let lines=[],h=c.kind==='draw'?cellH:110;
        if(c.kind==='guess'){
          ctx.font=`bold 26px ${family}`;lines=wrap(ctx,c.step.text,cellW-32);
          let rl=[];if(c.step.reason){ctx.font=`13px ${family}`;rl=wrap(ctx,c.step.reason,cellW-32);}
          c.reasonLines=rl;h=Math.max(110,26+lines.length*34+(rl.length?12+rl.length*19:0)+20);
        }
        if(c.kind==='skip'){ctx.font=`13px ${family}`;c.reasonLines=wrap(ctx,c.step.skipReason||'',cellW-32);h=Math.max(110,60+c.reasonLines.length*19+20);}
        c.lines=lines;c.h=h;return c;
      });
      rows.push({pair,h:Math.max(...pair.map(c=>c.h))+26});
    }
    const top=y;
    const h=CARD_PAD+30+route.length*20+12+rows.reduce((n,r)=>n+r.h+12,0)+CARD_PAD-12;
    if(draw){
      ctx.fillStyle='#fff';ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(PAD,top,W-PAD*2,h,16);ctx.fill();ctx.stroke();
      text(`${ci+1}. ${name(chain.ownerId)} 的接龙`,PAD+CARD_PAD,top+CARD_PAD+22,`bold 22px ${family}`,'#182443');
      route.forEach((l,i)=>text(l,PAD+CARD_PAD,top+CARD_PAD+46+i*20,`14px ${family}`,'#72809a'));
    }
    let ry=top+CARD_PAD+30+route.length*20+12;
    for(const row of rows){
      row.pair.forEach((c,k)=>{
        const x=PAD+CARD_PAD+k*(cellW+COLG);
        if(draw){
          text(c.label,x,ry+16,`bold 14px ${family}`,'#6a4bd0');
          const iy=ry+26,ih=row.h-26;
          if(c.kind==='draw'){
            const cv=document.createElement('canvas');cv.width=1000;cv.height=650;paint(cv,c.step.shapes);
            ctx.drawImage(cv,x,iy,cellW,cellW*0.65);
            ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1;ctx.strokeRect(x,iy,cellW,cellW*0.65);
          }else{
            ctx.fillStyle=c.kind==='origin'?'#f0ebfd':'#f8f5ff';ctx.strokeStyle='#ddd5f0';ctx.lineWidth=1;
            ctx.beginPath();ctx.roundRect(x,iy,cellW,ih,10);ctx.fill();ctx.stroke();
            if(c.kind==='origin')text(c.text,x+16,iy+ih/2+10,`bold 32px ${family}`,'#314aa0');
            else if(c.kind==='guess'){
              c.lines.forEach((l,i)=>text(l,x+16,iy+36+i*34,`bold 26px ${family}`,'#314aa0'));
              c.reasonLines.forEach((l,i)=>text(l,x+16,iy+36+c.lines.length*34+i*19,`13px ${family}`,'#66758b'));
            }else if(c.kind==='skip'){
              text('这一棒留空',x+16,iy+40,`bold 20px ${family}`,'#72809a');
              c.reasonLines.forEach((l,i)=>text(l,x+16,iy+68+i*19,`13px ${family}`,'#72809a'));
            }else text('未完成',x+16,iy+40,`bold 20px ${family}`,'#72809a');
          }
        }
      });
      ry+=row.h+12;
    }
    y=top+h+20;
  });
  return y+PAD-20;
}

function layout(ctx,game,family,draw){
  const text=(s,x,y,font,color)=>{ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.fillText(s,x,y);};
  let y=0;
  if(draw)drawHeader(ctx,family);
  y=84;
  // 冠军
  {
    const ranking=[...game.players].sort((a,b)=>b.total-a.total);
    const best=ranking[0]?.total??0,champs=ranking.filter(p=>p.total===best).map(p=>p.name).join('、');
    ctx.font=`bold 26px ${family}`;const nameLines=wrap(ctx,champs,W-PAD*2-CARD_PAD*2-90);
    ctx.font=`14px ${family}`;const board=wrap(ctx,ranking.map((p,i)=>`${i+1}. ${p.name} ${p.total} 分`).join('　'),W-PAD*2-CARD_PAD*2);
    const h=CARD_PAD+20+nameLines.length*34+8+board.length*20+CARD_PAD-8;
    if(draw){
      ctx.fillStyle='#fffdf6';ctx.strokeStyle='#e2c46a';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(PAD,y,W-PAD*2,h,16);ctx.fill();ctx.stroke();
      text('总冠军',PAD+CARD_PAD,y+CARD_PAD+8,`bold 13px ${family}`,'#a27b12');
      let cy=y+CARD_PAD+8+30;
      nameLines.forEach((l,i)=>{text(l,PAD+CARD_PAD,cy+i*34,`bold 26px ${family}`,'#314aa0');});
      text(`${best} 分`,W-PAD-CARD_PAD-ctx.measureText(`${best} 分`).width,y+CARD_PAD+8+30,`bold 20px ${family}`,'#a27b12');
      cy+=(nameLines.length-1)*34+26;
      board.forEach((l,i)=>text(l,PAD+CARD_PAD,cy+i*20,`14px ${family}`,'#72809a'));
    }
    y+=h+20;
  }
  const innerW=W-PAD*2-CARD_PAD*2,textX=PAD+CARD_PAD+IMG_W+GAP,textW=W-PAD-CARD_PAD-textX;
  for(const round of game.history){
    const top=y;
    // 先量出这一题要多高
    let h=CARD_PAD+30+20+14;
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
      text(`第 ${round.index+1} 题 · ${round.answer}`,PAD+CARD_PAD,top+CARD_PAD+22,`bold 22px ${family}`,'#182443');
      text(`${round.artistName} 作画 · +${round.drawGain} 分`,PAD+CARD_PAD,top+CARD_PAD+46,`14px ${family}`,'#72809a');
    }
    let by=top+CARD_PAD+30+20+14;
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
    if(!blocks.length&&draw)text('本题暂无已完成的画作。',PAD+CARD_PAD,top+CARD_PAD+30+20+34,`14px ${family}`,'#72809a');
    y=top+h+20;
  }
  return y+PAD-20;
}

export async function buildSummaryImage(game){
  try{await document.fonts.ready;}catch{}
  const family=getComputedStyle(document.body).fontFamily||'sans-serif';
  const probe=document.createElement('canvas').getContext('2d');
  const run=game.chains?layoutRelay:layout;
  const height=Math.ceil(run(probe,game,family,false));
  const scale=Math.min(2,30000/height);
  const canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.fillStyle='#faf8ff';ctx.fillRect(0,0,W,height);
  run(ctx,game,family,true);
  return canvas;
}

export async function exportSummaryImage(game){
  const canvas=await buildSummaryImage(game);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  if(!blob)throw new Error('生成图片失败');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=game.chains?'你画我猜-接龙总结.png':'你画我猜-比赛总结.png';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
