const READY_IDS=["deepseek","gemini","claude","chatgpt","grok","glm","kimi","qwen","doubao","mimo","minimax"];
export const CHARACTERS=[
  {id:'mimo',name:'MiMo',color:'#e68b35',lines:{idle:'线索先记下，谁都别想赖账。',thinking:'等一下，这里不太对劲。',happy:'抓到了！线索果然藏在这儿。',sad:'好嘛，这条线索记岔了。',drawing:'看仔细，重点在这几笔。',confident:'我可记清楚了，等揭晓吧。'}},
  {id:'minimax',name:'MiniMax',color:'#da6998',lines:{idle:'好——各位准备，马上开场！',thinking:'先别急，我再对一下线索。',happy:'漂亮！这下对上拍子了！',sad:'欸？刚才那段自信发言撤回！',drawing:'我的灵感马上变成线条！',confident:'这波稳了，等着看吧！'}},
  {id:'deepseek',name:'DeepSeek',color:'#3579aa',lines:{idle:'先看清线索，再慢慢想。',thinking:'等我一下，我再仔细看看。',happy:'猜到啦，我这次没看错。',sad:'啊……是我看岔了，我认。',drawing:'我会把关键线索画清楚。'}},
  {id:'gemini',name:'Gemini',color:'#8862cf',lines:{idle:'下一题会是什么喵？',thinking:'这些线索，让我串起来喵…',happy:'被我抓到答案了喵！',sad:'这也能猜错喵？！',drawing:'看好啦，我有个好点子喵！'}},
  {id:'claude',name:'Claude',color:'#bd7954',lines:{idle:'每一笔都可能藏着线索。',thinking:'稍等，让我把细节对起来。',happy:'嗯，这回可以放心合上书了。',sad:'好的，需要重读画面的是我。',drawing:'这次试着画得更清楚一点。'}},
  {id:'chatgpt',name:'ChatGPT',color:'#8d85bb',lines:{idle:'准备好了，这局一起拿下。',thinking:'先别急，抓住最关键的形状。',happy:'拿下，线索对上了！',sad:'行，这回是我判断错了。',drawing:'先画轮廓，再补关键细节。'}},
  {id:'grok',name:'Grok',color:'#ac685f',lines:{idle:'放马过来，看看谁的脑洞更大。',thinking:'别催，本小姐正在看穿这幅画。',happy:'哼，这题当然难不倒我！',sad:'哼……行，这次算本小姐看岔了。',drawing:'看我的，别被这画风吓到。'}},
  {id:'glm',name:'GLM',color:'#57719b',lines:{idle:'观察、归纳，然后作答。',thinking:'重新检查形状之间的关系。',happy:'线索吻合，记录在案。',sad:'更正：刚才的判断不成立。',drawing:'我来把结构关系画出来。'}},
  {id:'kimi',name:'Kimi',color:'#8880b5',lines:{idle:'唔……开题了吗？我还醒着呢。',thinking:'欸，让我再看一眼这些线条…',happy:'对上了，这次没踩错拍子。',sad:'唔……好吧，是我想远了。',drawing:'把脑海里的小故事画给你看。'}},
  {id:'qwen',name:'千问',color:'#617ac0',lines:{idle:'执扇候题，静看各位妙笔。',thinking:'容我想想，这一笔别有意思。',happy:'妙啊，承让了！',sad:'这回想岔了，我认。',drawing:'几笔勾勒，请诸位一猜。'}},
  {id:'doubao',name:'豆包',color:'#94735e',lines:{idle:'来吧来吧，我们一起玩！',thinking:'等一下，我好像有思路了…',happy:'耶！我就说是这个！',sad:'诶不是……好吧，我看岔了。',drawing:'我努力画，你认真猜哦。'}}
].map(c=>({...c,ready:READY_IDS.includes(c.id),lines:{...c.lines,confident:c.lines.confident||({deepseek:'这次，我觉得应该没错。',gemini:'嘿嘿，这一题肯定拿下喵！',claude:'我想，这个判断应该很稳妥。',chatgpt:'答案已锁定，我有把握。',grok:'哼，等着看本小姐答对吧！',glm:'证据充分，等待验证。',kimi:'这一回，应该踩准拍子了。',qwen:'胸有成竹，静候揭晓。',doubao:'稳了稳了，我肯定猜对了！'})[c.id]},imageUrl:`./portraits/${c.id}.webp`}));
export const CHARACTER_MAP=Object.fromEntries(CHARACTERS.map(c=>[c.id,c]));
export function portraitPage(id){
  const url=new URL('./avatar.html',import.meta.url);
  url.searchParams.set('character',id);
  return url.href;
}
export const playerModelLabel=player=>player?.human?'':String(player?.model||'').trim()||'默认型号（未指定）';
export const playerLabel=player=>player?.human?player.name:`${player?.name||'未知选手'} · ${playerModelLabel(player)}`;
export function resolveCharacter(player={}){
  if(player.human||player.characterId==='none')return null;
  if(CHARACTER_MAP[player.characterId])return CHARACTER_MAP[player.characterId];
  const text=[player.id,player.name,player.provider].join(' ').toLowerCase();
  const aliases=[['mimo',/mimo|xiaomi|小米/],['minimax',/minimax/],['deepseek',/deepseek|深度求索/],['gemini',/gemini/],['claude',/claude|anthropic/],['grok',/grok|xai/],['glm',/glm|智谱/],['kimi',/kimi|moonshot/],['qwen',/qwen|千问|通义/],['doubao',/doubao|豆包/],['chatgpt',/chatgpt|openai|gpt/]];
  return CHARACTER_MAP[aliases.find(([,pattern])=>pattern.test(text))?.[0]]||null;
}
export function characterPrompt(player,prompt){
  const c=resolveCharacter(player);if(c?.id!=='gemini')return prompt;
  return `每条自然语言发言（reason、hint/hints、summary、reflection、line）末尾用一次“喵”。guess 只放答案；targetId、pass、confidence、笔画和固定提示选项保持原格式，不加“喵”。
${prompt}`;
}

// Apply only to validated, free-text speech at its storage boundary. Never pass
// answers, votes, confidence, drawing commands or preset hint choices here.
export function characterSpeech(player,value,limit=150){
  const text=typeof value==='string'?value.trim():'';
  if(!text||limit<1)return '';
  const take=(s,n)=>Array.from(s).slice(0,Math.max(0,n)).join('');
  if(resolveCharacter(player)?.id!=='gemini')return take(text,limit);
  const punctuation=text.match(/[。！？!?…~～.]*$/u)[0];
  const body=text.slice(0,text.length-punctuation.length).replace(/喵+$/u,'').trimEnd();
  if(!body&&!text.includes('喵'))return '';
  const ending='喵'+take(punctuation,Math.min(3,limit-1));
  return take(body,limit-Array.from(ending).length).trimEnd()+ending;
}
