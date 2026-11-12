import {Game} from './game.mjs';
import {RelayGame} from './relay.mjs';
import {callModel} from './providers.mjs';

export function createMatch(onChange) {
  let game=null;

  function close() {
    if(!game)return;
    game.onChange=null;
    game.finish();
    for(const review of game.reviews||[])review.dispose();
    game=null;
    onChange();
  }

  function start(options) {
    const rules=options.mode==='relay'?RelayGame:Game;
    const next=new rules({...options,run:callModel});
    close();
    game=next;
    game.onChange=onChange;
    launch(()=>next.next());
  }

  function launch(work) {
    const current=game;
    Promise.resolve().then(work).catch(error=>{
      if(current!==game||current.aborted)return;
      current.notice=error.message;
      current.touch();
    });
  }

  async function action(id,name,data={}) {
    const current=game;
    if(!current||current.id!==id)throw new Error('比赛已变更，请查看当前页面。');
    if(name==='home')return close();
    if(name==='finish')return current.finish();
    if(name.startsWith('banter-')){
      const review=current.reviews?.find(item=>item.banter?.id===data.banterId);
      const banter=current.phase==='reveal'?current.banter:review?.banter;
      if(!banter)throw new Error('当前没有互动环节。');
      banter.check(data);
      switch(name){
        case 'banter-challenge': return banter.challenge(data);
        case 'banter-reply': return banter.reply(data);
        case 'banter-retry': return banter.retry(data);
        case 'banter-skip': return banter.skip(data);
      }
    }
    if(current.mode==='relay'){
      switch(name){
        case 'relay-submit': return current.submitHuman(data);
        case 'relay-retry': return current.retry(data);
        case 'relay-skip-errors': return current.skipErrors(data);
      }
      const review=current.reviews?.find(item=>item.chain.id===data.chainId);
      if(!review)throw new Error('这条接龙当前无法评议。');
      switch(name){
        case 'relay-review': return review.start(data);
        case 'relay-vote': return review.humanVote(data);
        case 'relay-vote-retry': return review.retryVotes(data);
        case 'relay-vote-abstain': return review.abstainErrors(data);
        case 'relay-reflection': return review.humanReflection(data);
        case 'relay-reflection-retry': return review.retryReflections(data);
        default: throw new Error('当前接龙无法执行此操作。');
      }
    }
    switch(name){
      case 'draw-done': return current.beginGuess(data);
      case 'guess': return current.humanGuess(data.guess);
      case 'pass': return current.humanGuess('',true);
      case 'revise': return current.revise();
      case 'retry-draw':
        if(current.phase!=='draw-error')throw new Error('当前不能重试画图。');
        return current.drawAI();
      case 'retry-guesses':
        if(current.phase!=='guessing'||!Object.values(current.results).some(result=>result.status==='error')){
          throw new Error('没有需要重试的选手。');
        }
        return current.guessAIs(true);
      case 'skip-errors': return current.skipErrors();
      case 'reveal': return current.reveal();
      case 'next': return current.next();
      default: throw new Error('当前比赛无法执行此操作。');
    }
  }

  return {start,action,snapshot:()=>game?.snapshot()||null};
}
