import {CHARACTERS,CHARACTER_MAP} from './characters.mjs';
import {escapeText as esc} from './conversation.mjs';
import {mountModelPicker} from './model-picker.mjs';
import {chosenEffort,waitSeconds} from './reasoning.mjs';
import {PRESETS} from './lib/providers.mjs';
import {modelCatalog} from './lib/model-catalog.mjs';
import {MAX_STORED,MAX_COPIES,isCopy,isTestHost,preferencePrefix} from './lib/settings.mjs';
import {DEFAULT_MODELS,OPENROUTER_BASE} from './lib/default-models.mjs';

function settingsRow(player){
  const character=CHARACTER_MAP[player.characterId];
  return `<article class="provider-form" data-id="${esc(player.id)}">
    <div class="provider-title"><input class="provider-name" data-field="name" value="${esc(player.name)}" maxlength="40" aria-label="选手名字"><button class="remove-provider" data-remove>移除</button></div>
    <details class="wide player-meta">
      <summary>接入方式与角色形象</summary>
      <div class="provider-grid">
        <label>接入方式<select data-field="provider">
          ${Object.entries(PRESETS).filter(([id])=>id!=='mock'||isTestHost()).map(([id,preset])=>`<option value="${id}" ${player.provider===id?'selected':''}>${esc(preset.label)}</option>`).join('')}
        </select></label>
        <label class="wide">角色形象<select data-field="characterId">
          <option value="none">自动形象</option>
          ${CHARACTERS.map(c=>`<option value="${c.id}" ${player.characterId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select></label>
      </div>
    </details>
    <div class="model-picker">
      <input type="hidden" data-field="reasoningEffort" value="${esc(chosenEffort(player))}">
      <input type="hidden" data-field="timeoutSeconds" value="${waitSeconds(player)}">
      <input data-field="model" value="${esc(player.model)}">
    </div>
    <details class="wide connection-details">
      <summary>接入与密钥设置</summary>
      <label>接口基础地址<input data-field="baseUrl" value="${esc(player.baseUrl)}" placeholder="https://…/v1"></label>
      <p class="provider-hint">${esc(PRESETS[player.provider]?.hint||'')}</p>
      <label>API Key<input type="password" data-field="apiKey" autocomplete="off" placeholder="${player.hasOwnKey?'留空保留已存的 Key':'填入单独的 API Key'}"></label>
      <label class="check" ${player.hasOwnKey?'':'hidden'}><input type="checkbox" data-field="clearKey"> 清除这个选手的单独 Key</label>
    </details>
    <div class="provider-bottom"><label class="check"><input type="checkbox" data-field="enabled" ${player.enabled?'checked':''}> 默认加入比赛</label></div>
  </article>`;
}

const QUICK_SOURCES={
  openrouter:{label:'OpenRouter（推荐，一把 Key 用各家 AI；如果你买不了它，就换一家）',name:'OpenRouter',url:'https://openrouter.ai/keys',hint:'先在 OpenRouter 注册并充值，再创建一把 Key。保存后可以挑选让哪些 AI 上场。'},
  deepseek:{label:'DeepSeek 官方（推荐）',name:'DeepSeek',player:'deepseek',url:'https://platform.deepseek.com/',hint:'这把 Key 只让 DeepSeek 上场。先在 DeepSeek 开放平台登录、充值并创建 Key。'},
  siliconflow:{label:'硅基流动（国内聚合平台，推荐）',name:'硅基流动',aggregator:true,url:'https://cloud.siliconflow.cn/',hint:'国内聚合平台，一把 Key 能用 DeepSeek、千问、GLM、Kimi 等。先在硅基流动注册、充值并创建 Key，保存后挑选型号上场。'},
  bailian:{label:'阿里云百炼（国内聚合平台）',name:'阿里云百炼',aggregator:true,url:'https://bailian.console.aliyun.com/',hint:'阿里云的模型平台，千问全系列和部分第三方模型。先在百炼控制台开通、充值并创建 API Key，保存后挑选型号上场。'},
  ark:{label:'火山方舟（国内聚合平台）',name:'火山方舟',aggregator:true,url:'https://console.volcengine.com/ark',hint:'字节的模型平台，豆包全系列和部分第三方模型。先在火山方舟控制台开通模型、充值并创建 API Key，保存后挑选型号上场。'},
  glm:{label:'智谱 GLM 官方（不能用：官方接口不允许网页调用，我服了）',name:'智谱 GLM',player:'glm',url:'',unsupported:true,hint:'智谱官方接口不允许从网页直接调用，粘贴 Key 也连不上。想让 GLM 上场，请改用 OpenRouter 的 Key。'},
  kimi:{label:'Kimi 官方',name:'Kimi',player:'kimi',url:'https://platform.moonshot.ai/',hint:'这把 Key 只让 Kimi 上场。先在 Moonshot 开放平台登录、充值并创建 Key。'},
  qwen:{label:'千问官方',name:'千问',player:'qwen',url:'',hint:'这把 Key 只让千问上场。先在千问的模型平台登录、充值并创建 Key。'},
  openai:{label:'OpenAI 官方',name:'OpenAI',player:'chatgpt',url:'https://platform.openai.com/api-keys',hint:'这把 Key 只让 ChatGPT 上场。先在 OpenAI 平台登录、充值并创建 Key。'},
  anthropic:{label:'Anthropic 官方',name:'Anthropic',player:'claude',url:'https://console.anthropic.com/',hint:'这把 Key 只让 Claude 上场。先在 Anthropic 控制台登录、充值并创建 Key。'},
  gemini:{label:'Google Gemini 官方',name:'Gemini',player:'gemini',url:'https://aistudio.google.com/apikey',hint:'这把 Key 只让 Gemini 上场。先在 Google AI Studio 登录并创建 Key。'},
  grok:{label:'xAI Grok 官方',name:'Grok',player:'grok',url:'https://console.x.ai/',hint:'这把 Key 只让 Grok 上场。先在 xAI 控制台登录、充值并创建 Key。'},
  other:{label:'自定义接口（在高级设置中配置）',name:'自定义接口',unsupported:true,url:'',hint:'请展开「高级设置」，为选手填写接口地址、型号和 Key。'}
};

// 聚合平台：读取型号列表，按 AI 家族各挑一个型号，名字里带「看图」特征的优先。
const FAMILY_PATTERNS={deepseek:/deepseek/i,qwen:/qwen|qvq/i,glm:/glm|thudm|zhipu/i,kimi:/kimi|moonshot/i,doubao:/doubao|seed/i,minimax:/minimax/i,mimo:/mimo/i,chatgpt:/gpt|openai/i,claude:/claude/i,gemini:/gemini/i,grok:/grok/i};
const NOT_CHAT=/embed|rerank|bge|tts|whisper|speech|audio|asr|flux|stable-diffusion|kolors|wan2|video|seedream|seedance|image|ocr|math|coder|translat/i;
const LOOKS_VISION=/vl|vision|omni|qvq|4v|\dv\b|-v-|multimodal/i;
export function pickFamilyModels(ids){
  const families={};
  for(const [family,pattern] of Object.entries(FAMILY_PATTERNS)){
    const chat=ids.filter(id=>pattern.test(id)&&!NOT_CHAT.test(id));
    const vision=chat.filter(id=>LOOKS_VISION.test(id));
    if(chat.length)families[family]={model:(vision[0]||chat[0]),vision:vision.length>0};
  }
  return families;
}
async function fetchPlatformModels(baseUrl,key){
  const response=await fetch(baseUrl+'/models',{headers:{Authorization:'Bearer '+key},credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
  if(response.status===401||response.status===403)throw new Error('Key 无效或没有权限，请检查后重新粘贴。');
  if(!response.ok)throw new Error('读取型号列表失败（'+response.status+'）。可以展开「高级设置」手动填写型号。');
  const data=await response.json();
  return (data.data||data.models||[]).map(m=>typeof m==='string'?m:m.id).filter(Boolean);
}

const field=(row,name)=>row.querySelector('[data-field='+name+']');
function rowPlayer(row){
  const value=name=>field(row,name).value;
  return {
    id:row.dataset.id,name:value('name'),provider:value('provider'),characterId:value('characterId'),
    model:value('model'),baseUrl:value('baseUrl'),apiKey:value('apiKey'),
    clearKey:field(row,'clearKey').checked,enabled:field(row,'enabled').checked,
    reasoningEffort:value('reasoningEffort'),timeoutSeconds:Number(value('timeoutSeconds'))
  };
}

export function mountSettings(settings,{onChange,toast}){
  const $=id=>document.getElementById(id);
  const dialog=$('settingsDialog'),host=$('settingsPlayers');
  let catalog;
  // 聚合平台的 Key 和型号表，存在这台电脑的浏览器里，刷新后自动读回。
  const platformStorageKey=preferencePrefix+'platform-keys-v1';
  const platformKeys=new Map();
  try{for(const [id,v] of Object.entries(JSON.parse(localStorage.getItem(platformStorageKey)||'{}')))if(QUICK_SOURCES[id]?.aggregator&&v&&typeof v.key==='string'&&v.families&&typeof v.families==='object')platformKeys.set(id,{key:v.key,families:v.families,name:QUICK_SOURCES[id].name});}catch{}
  const savePlatformKeys=()=>{try{if(platformKeys.size)localStorage.setItem(platformStorageKey,JSON.stringify(Object.fromEntries(platformKeys)));else localStorage.removeItem(platformStorageKey);}catch{}};
  const rows=()=>[...host.querySelectorAll('.provider-form')];
  const refresh=row=>mountModelPicker(row,rowPlayer(row),catalog);

  // 轮椅模式：选 Key 的来源，粘贴一次就能开玩。
  function updateQuickHint(){
    syncSourcePicker?.();
    const source=QUICK_SOURCES[$('quickSource').value],locked=!!source.unsupported;
    $('quickHint').innerHTML=source.hint+(source.url?` <a href="${source.url}" target="_blank" rel="noopener">去创建 Key ↗</a>`:'');
    $('quickKey').disabled=locked;$('quickSave').disabled=locked;
    $('quickKey').placeholder=locked?'请在高级设置中配置':'粘贴你的 '+source.name+' API Key';
  }
  function updateQuickStatus(){
    const players=settings.list(),own=[...new Set(players.filter(p=>p.hasOwnKey&&!isCopy(p)&&!platformKeys.has(p.provider)).map(p=>CHARACTER_MAP[p.characterId]?.name||p.name))];
    const parts=[...(settings.hasSharedKey()?['OpenRouter']:[]),...[...platformKeys.values()].map(p=>p.name),...own];
    $('quickStatus').classList.toggle('connected',parts.length>0);
    $('quickStatus').textContent=parts.length?'已连接：'+parts.join('、')+'。Key 存在这台电脑的浏览器里，刷新不会丢。':'还没有连接任何 AI。';
    $('quickClear').hidden=!parts.length;
  }
  // 快捷区改动后，高级设置里的选手列表也跟着刷新。
  function renderAdvanced(){host.innerHTML=settings.list().map(settingsRow).join('');rows().forEach(refresh);}
  function renderCopies(){
    if(dialog.open)renderAdvanced();
    const list=settings.list(),bases=list.filter(p=>p.ready&&!isCopy(p));
    $('quickCopies').hidden=!bases.length&&!settings.hasSharedKey()&&!platformKeys.size;
    $('quickCopyList').innerHTML=bases.map(p=>{
      const n=settings.copiesOf(p.id),team=list.filter(x=>x.id===p.id||x.id.startsWith(p.id+'-copy-'));
      return `<div class="quick-copy" data-base="${esc(p.id)}"><div class="quick-copy-head"><span class="quick-copy-name"><i style="background:${esc(p.color)}"></i>${esc(CHARACTER_MAP[p.characterId]?.name||p.name)}</span><span class="stepper"><button data-step="-1" aria-label="少一位" ${n<=1?'disabled':''}>−</button><b>${n}</b><button data-step="1" aria-label="多一位" ${n>=MAX_COPIES?'disabled':''}>＋</button></span><span class="quick-copy-unit">位上场</span></div><div class="quick-names">${team.map(x=>`<input data-rename="${esc(x.id)}" value="${esc(x.name)}" maxlength="40" aria-label="给这位 AI 改名">`).join('')}</div></div>`;
    }).join('');
    const present=new Set(list.map(p=>p.id)),addable=[];
    if(settings.hasSharedKey())for(const c of CHARACTERS)if(!present.has(c.id))addable.push({value:'openrouter:'+c.id,text:c.name+(platformKeys.size?'（OpenRouter）':'')});
    for(const [sourceId,platform] of platformKeys)for(const c of CHARACTERS){const f=platform.families[c.id];if(f&&!present.has(c.id))addable.push({value:sourceId+':'+c.id,text:`${c.name}（${platform.name}${f.vision?'':'，可能看不了图'}）`});}
    $('quickAdd').hidden=!addable.length;
    $('quickAddCharacter').innerHTML=addable.map(o=>`<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('');
    const total=list.filter(p=>p.ready&&p.enabled).length;
    $('quickCopyTotal').textContent=`共 ${total} 位 AI 上场${total>12?'（同场最多 12 位，开赛前请在大厅少选几位）':''}`;
  }
  $('quickCopyList').onclick=event=>{
    const button=event.target.closest('[data-step]');if(!button)return;
    const id=button.closest('[data-base]').dataset.base;
    try{settings.setCopies(id,settings.copiesOf(id)+Number(button.dataset.step));onChange({selectionChanged:true});renderCopies();}
    catch(error){$('quickStatus').textContent=error.message;}
  };
  $('quickCopyList').onchange=event=>{
    const input=event.target.closest('[data-rename]');if(!input)return;
    try{settings.rename(input.dataset.rename,input.value);onChange();}
    catch(error){toast(error.message);input.value=settings.list().find(p=>p.id===input.dataset.rename)?.name||'';}
  };
  $('quickCopyList').onkeydown=event=>{if(event.key==='Enter'&&event.target.matches('[data-rename]')){event.preventDefault();event.target.blur();}};
  $('quickAddButton').onclick=()=>{
    try{
      const [sourceId,characterId]=$('quickAddCharacter').value.split(':');
      settings.ensurePlayer(characterId);
      if(sourceId!=='openrouter')connectPlatformPlayers(sourceId,[characterId]);
      onChange({selectionChanged:true});renderCopies();
    }catch(error){$('quickStatus').textContent=error.message;}
  };
  // 把指定的 AI 接到某个聚合平台：用平台上匹配到的型号和这把 Key。
  function connectPlatformPlayers(sourceId,characterIds){
    const platform=platformKeys.get(sourceId);
    const rows=settings.list().map(p=>characterIds.includes(p.id)&&platform.families[p.characterId]
      ?{...p,provider:sourceId,baseUrl:PRESETS[sourceId].baseUrl,model:platform.families[p.characterId].model,reasoningEffort:'auto',apiKey:platform.key,clearKey:false,enabled:true}
      :{...p,apiKey:'',clearKey:false});
    settings.save(rows);
    for(const id of characterIds)if(settings.list().some(p=>p.id===id))settings.setCopies(id,settings.copiesOf(id));
  }
  $('quickDone').onclick=()=>dialog.close();
  async function saveQuickKey(){
    const sourceId=$('quickSource').value,source=QUICK_SOURCES[sourceId],key=$('quickKey').value.trim();
    if(source.unsupported)return;
    if(!key){$('quickStatus').textContent='请先粘贴 API Key。';$('quickKey').focus();return;}
    if(source.aggregator){
      $('quickSave').disabled=true;$('quickStatus').textContent='正在读取 '+source.name+' 的型号列表…';
      try{
        const families=pickFamilyModels(await fetchPlatformModels(PRESETS[sourceId].baseUrl,key));
        if(!Object.keys(families).length)throw new Error('没在 '+source.name+' 上找到能用的对话型号，可以展开「高级设置」手动填写。');
        platformKeys.set(sourceId,{key,families,name:source.name});savePlatformKeys();
        // 和 OpenRouter 一样：还没连上的 AI，只要平台上有就自动接上；一个都没有时先请一位上场。
        let targets=settings.list().filter(p=>!p.ready&&!isCopy(p)&&families[p.characterId]?.vision).map(p=>p.id);
        if(!targets.length&&!settings.list().some(p=>p.ready)){const first=['deepseek','qwen','glm','kimi','doubao'].find(id=>families[id]?.vision)||Object.keys(families)[0];settings.ensurePlayer(first);targets=[first];}
        if(targets.length)connectPlatformPlayers(sourceId,targets);
        onChange({selectionChanged:true});
        $('quickKey').value='';updateQuickStatus();renderCopies();
        toast(source.name+' 已连接。在下面挑选上场的 AI，也可以给它们改名。');
      }catch(error){$('quickStatus').textContent=error.message;}
      finally{$('quickSave').disabled=false;}
      return;
    }
    try{
      if(sourceId==='openrouter'){
        settings.setSharedKey(key);
        // 没有单独 Key 的选手全部改回 OpenRouter，保证一把 Key 就能让大家上场。
        const rows=settings.list().map(p=>p.hasOwnKey||p.provider==='mock'?{...p,apiKey:'',clearKey:false}:{...p,provider:'openrouter',baseUrl:OPENROUTER_BASE,
          model:p.provider==='openrouter'?p.model:DEFAULT_MODELS[p.characterId]||PRESETS.openrouter.model,reasoningEffort:p.provider==='openrouter'?p.reasoningEffort:'auto',apiKey:'',clearKey:false});
        if(!rows.some(p=>p.enabled))(rows.find(p=>p.characterId==='chatgpt')||rows[0]).enabled=true;
        settings.save(rows);
        onChange({selectionChanged:true});
        $('quickKey').value='';
        updateQuickStatus();renderCopies();
        toast('OpenRouter 已连接。在下面挑选上场的 AI，也可以给它们改名。');
        return;
      }else{
        settings.ensurePlayer(source.player);
        const rows=settings.list().map(p=>{
          if(p.id!==source.player)return {...p,apiKey:'',clearKey:false,enabled:p.id.startsWith(source.player+'-copy-')||(p.enabled&&p.ready)};
          return {...p,provider:sourceId,baseUrl:PRESETS[sourceId].baseUrl,model:PRESETS[sourceId].model,reasoningEffort:'auto',apiKey:key,clearKey:false,enabled:true};
        });
        settings.save(rows);
        settings.setCopies(source.player,settings.copiesOf(source.player));
        onChange({selectionChanged:true});
        $('quickKey').value='';
        updateQuickStatus();renderCopies();
        toast(source.name+' 已连接。可以设置上场人数，或再粘贴一家的 Key。');
        return;
      }
      $('quickKey').value='';
      dialog.close();
      toast(source.name+' 已连接，选好题目就能开始。');
    }catch(error){$('quickStatus').textContent=error.message;}
  }
  $('quickSource').innerHTML=Object.entries(QUICK_SOURCES).map(([id,s])=>`<option value="${id}">${esc(s.label)}</option>`).join('');
  $('quickSource').onchange=updateQuickHint;
  // 自制下拉：系统自带的下拉在手机上不会换行，长选项会撑出屏幕。
  const syncSourcePicker=(()=>{
    const select=$('quickSource');select.hidden=true;
    const wrap=document.createElement('div');wrap.className='source-picker';
    wrap.innerHTML='<button type="button" class="source-current" aria-haspopup="listbox" aria-expanded="false"></button><ul class="source-list" role="listbox" aria-label="Key 来自" hidden></ul>';
    select.after(wrap);
    const button=wrap.querySelector('button'),list=wrap.querySelector('ul');
    const split=text=>{const m=text.match(/^(.*?)（(.*)）$/);return m?[m[1],m[2]]:[text,''];};
    const item=text=>{const [name,note]=split(text);return `<b>${esc(name)}</b>${note?`<small>${esc(note)}</small>`:''}`;};
    list.innerHTML=[...select.options].map(o=>{const s=QUICK_SOURCES[o.value];return `<li role="option" data-value="${esc(o.value)}" class="${s.unsupported?'muted':''}">${item(o.textContent)}</li>`;}).join('');
    const close=()=>{list.hidden=true;button.setAttribute('aria-expanded','false');};
    button.onclick=()=>{
      const opening=list.hidden;list.hidden=!opening;button.setAttribute('aria-expanded',String(opening));
      if(opening)list.querySelector(`[data-value="${select.value}"]`)?.scrollIntoView({block:'nearest'});
    };
    list.onclick=event=>{const li=event.target.closest('li');if(!li)return;select.value=li.dataset.value;select.dispatchEvent(new Event('change'));close();button.focus();};
    document.addEventListener('click',event=>{if(!wrap.contains(event.target))close();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!list.hidden){event.preventDefault();close();button.focus();}});
    return ()=>{button.innerHTML=item(select.selectedOptions[0]?.textContent||'');for(const li of list.children)li.setAttribute('aria-selected',String(li.dataset.value===select.value));};
  })();
  $('quickSave').onclick=saveQuickKey;
  $('quickKey').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();saveQuickKey();}};
  $('quickClear').onclick=()=>{
    try{
      settings.setSharedKey('');platformKeys.clear();savePlatformKeys();
      settings.save(settings.list().map(p=>({...p,apiKey:'',clearKey:true})));
      onChange();updateQuickStatus();renderCopies();toast('已清除全部 Key。');
    }catch(error){$('quickStatus').textContent=error.message;}
  };
  $('advancedSettings').ontoggle=()=>dialog.classList.toggle('advanced-open',$('advancedSettings').open);
  $('closeSettings').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    $('quickKey').value='';
    host.replaceChildren();
  });

  host.onchange=event=>{
    const row=event.target.closest('.provider-form');
    if(!row)return;
    const changed=event.target.dataset.field;
    const playerField=name=>field(row,name);
    function setProvider(provider,model){
      playerField('provider').value=provider;
      playerField('baseUrl').value=PRESETS[provider].baseUrl;
      playerField('model').value=model;
      playerField('reasoningEffort').value='auto';
      playerField('apiKey').value='';
      row.querySelector('.provider-hint').textContent=PRESETS[provider].hint||'';
    }
    if(event.target.hasAttribute('data-route-choice')){
      const source=event.target.value,family=playerField('characterId').value;
      const options=(catalog?.models||[]).filter(m=>m.source===source&&(family==='none'||m.family===family)&&m.vision&&m.gameDrawing);
      const current=playerField('model').value.split('/').at(-1).toLowerCase();
      const next=options.find(m=>m.id.split('/').at(-1).toLowerCase()===current)||options[0];
      if(next)setProvider(source,next.id);
    }
    if(changed==='provider')setProvider(event.target.value,PRESETS[event.target.value].model);
    if(event.target.hasAttribute('data-model-choice')){
      playerField('model').value=event.target.value;
      playerField('reasoningEffort').value='auto';
    }
    if(event.target.hasAttribute('data-show-text'))row.dataset.showText=String(event.target.checked);
    if(['model','baseUrl'].includes(changed))playerField('reasoningEffort').value='auto';
    if(!['apiKey','enabled','clearKey','name','timeoutSeconds'].includes(changed))refresh(row);
  };
  host.onclick=event=>{
    event.target.closest('[data-remove]')?.closest('.provider-form').remove();
  };
  $('saveSettings').onclick=()=>{
    try{
      const current=settings.list();
      const input=rows().map(row=>{
        const player=rowPlayer(row);
        return {...player,color:current.find(p=>p.id===player.id)?.color};
      });
      const saved=settings.save(input);
      onChange({selectionChanged:true});
      dialog.close();
      toast(saved?'AI 设置已保存。':'AI 设置已在本页生效。');
    }catch(error){$('settingsStatus').textContent=error.message;}
  };
  $('addPlayer').onclick=()=>{
    if(host.children.length>=MAX_STORED){$('settingsStatus').textContent=`最多配置 ${MAX_STORED} 位 AI。`;return;}
    host.insertAdjacentHTML('beforeend',settingsRow({
      id:'ai-'+crypto.randomUUID().slice(0,8),name:'新 AI',provider:'openrouter',
      model:PRESETS.openrouter.model,baseUrl:PRESETS.openrouter.baseUrl
    }));
    refresh(host.lastElementChild);
    host.lastElementChild.scrollIntoView({block:'nearest'});
  };

  return async function openSettings(focus){
    if(dialog.open)return;
    // 从大厅点灰色小框进来时，直接选好那一家的 Key 来源。
    const focusSource=typeof focus==='string'&&Object.entries(QUICK_SOURCES).find(([,s])=>s.player===focus)?.[0];
    $('quickSource').value=focusSource||'openrouter';
    host.innerHTML=settings.list().map(settingsRow).join('');
    rows().forEach(refresh);
    $('settingsStatus').textContent='';
    updateQuickHint();updateQuickStatus();renderCopies();
    $('advancedSettings').open=false;dialog.classList.remove('advanced-open');
    dialog.showModal();
    if(!$('quickKey').disabled)$('quickKey').focus();
    $('modelCatalogStatus').textContent='正在读取型号目录…';
    catalog=await modelCatalog();
    $('modelCatalogStatus').textContent=catalog.warning||'型号目录已加载。';
    rows().forEach(row=>{
      if(!row.querySelector('.model-picker').contains(document.activeElement))refresh(row);
    });
  };
}
