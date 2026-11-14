import {CHARACTERS,CHARACTER_MAP} from './characters.mjs';
import {escapeText as esc} from './conversation.mjs';
import {mountModelPicker} from './model-picker.mjs';
import {chosenEffort,waitSeconds} from './reasoning.mjs';
import {DEFAULT_PLAYERS,PRESETS} from './lib/providers.mjs';
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
  openrouter:{label:'OpenRouter（推荐，一把 Key 用各家 AI；如果你买不了它，就换一家）',name:'OpenRouter',url:'https://openrouter.ai/keys',hint:'先在 OpenRouter 注册并充值，再创建一把 Key。保存后会自动选中可用的内置 AI，可在大厅取消勾选。'},
  deepseek:{label:'DeepSeek 官方（推荐）',name:'DeepSeek',player:'deepseek',url:'https://platform.deepseek.com/',hint:'这把 Key 只让 DeepSeek 上场。先在 DeepSeek 开放平台登录、充值并创建 Key。'},
  siliconflow:{label:'硅基流动（国内聚合平台，不推荐）',name:'硅基流动',aggregator:true,url:'https://cloud.siliconflow.cn/',hint:'国内聚合平台，一把 Key 能用 DeepSeek、千问、GLM、Kimi 等。先在硅基流动注册、充值并创建 Key，保存后可在高级设置换型号。'},
  bailian:{label:'阿里云百炼（国内聚合平台）',name:'阿里云百炼',aggregator:true,url:'https://bailian.console.aliyun.com/',hint:'阿里云的模型平台，千问全系列和部分第三方模型。先在百炼控制台开通、充值并创建 API Key，保存后可在高级设置换型号。'},
  ark:{label:'火山方舟（国内聚合平台）',name:'火山方舟',aggregator:true,url:'https://console.volcengine.com/ark',hint:'字节的模型平台，豆包全系列和部分第三方模型。先在火山方舟控制台开通模型、充值并创建 API Key，保存后可在高级设置换型号。'},
  glm:{label:'智谱 GLM 官方（不能用：官方接口不允许网页调用，我服了）',name:'智谱 GLM',player:'glm',url:'',unsupported:true,hint:'智谱官方接口不允许从网页直接调用，粘贴 Key 也连不上。想让 GLM 上场，请改用 OpenRouter 的 Key。'},
  kimi:{label:'Kimi 官方',name:'Kimi',player:'kimi',url:'https://platform.moonshot.ai/',hint:'这把 Key 只让 Kimi 上场。先在 Moonshot 开放平台登录、充值并创建 Key。'},
  qwen:{label:'千问官方',name:'千问',player:'qwen',url:'',hint:'这把 Key 只让千问上场。先在千问的模型平台登录、充值并创建 Key。'},
  openai:{label:'OpenAI 官方',name:'OpenAI',player:'chatgpt',url:'https://platform.openai.com/api-keys',hint:'这把 Key 只让 ChatGPT 上场。先在 OpenAI 平台登录、充值并创建 Key。'},
  anthropic:{label:'Anthropic 官方',name:'Anthropic',player:'claude',url:'https://console.anthropic.com/',hint:'这把 Key 只让 Claude 上场。先在 Anthropic 控制台登录、充值并创建 Key。'},
  gemini:{label:'Google Gemini 官方',name:'Gemini',player:'gemini',url:'https://aistudio.google.com/apikey',hint:'这把 Key 只让 Gemini 上场。先在 Google AI Studio 登录并创建 Key。'},
  vertex:{label:PRESETS.vertex.label,name:'Vertex AI',player:'gemini',url:'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/api-keys?usertype=standard',hint:'填写 Google Cloud 项目 ID 和绑定服务账号的 Vertex AI API Key。默认使用 Gemini 4 Hydrogen，可在高级设置里切换型号。'},
  grok:{label:'xAI Grok 官方',name:'Grok',player:'grok',url:'https://console.x.ai/',hint:'这把 Key 只让 Grok 上场。先在 xAI 控制台登录、充值并创建 Key。'},
  other:{label:'自定义接口（在高级设置中配置）',name:'自定义接口',unsupported:true,url:'',hint:'请展开「高级设置」，为选手填写接口地址、型号和 Key。'}
};

function playerConnection(player){
  const baseUrl=player.baseUrl.trim().replace(/\/+$/,'');
  const provider=player.provider==='compatible'&&baseUrl===OPENROUTER_BASE?'openrouter':player.provider;
  const preset=PRESETS[provider];
  const matchesPreset=baseUrl&&(baseUrl===preset?.baseUrl||
    provider==='vertex'&&/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/[^/]+\/locations\/global$/.test(baseUrl));
  if(!matchesPreset)return {label:'当前自定义接口'};
  const source=QUICK_SOURCES[provider];
  return {label:source?.label.split('（')[0]||preset.label,quickId:source&&!source.unsupported?provider:''};
}

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

function addDefaultPlayers(players,ids){
  const existing=new Set(players.map(player=>player.id));
  return [...players,...DEFAULT_PLAYERS.filter(player=>ids.has(player.id)&&!existing.has(player.id))];
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
  const projectRow=document.createElement('div');
  projectRow.className='quick-key-row quick-source';
  projectRow.hidden=true;
  const vertexProject=document.createElement('input');
  vertexProject.placeholder='Google Cloud 项目 ID';
  vertexProject.setAttribute('aria-label',vertexProject.placeholder);
  vertexProject.autocomplete='off';
  projectRow.append(vertexProject);
  $('quickKey').closest('.quick-key-row').before(projectRow);
  let catalog,savingQuickKey=false,quickKeyPlayerId='';
  // 聚合平台的 Key 和型号表，存在这台电脑的浏览器里，刷新后自动读回。
  const platformStorageKey=preferencePrefix+'platform-keys-v1';
  const platformKeys=new Map();
  try{for(const [id,v] of Object.entries(JSON.parse(localStorage.getItem(platformStorageKey)||'{}')))if(QUICK_SOURCES[id]?.aggregator&&v&&typeof v.key==='string'&&v.families&&typeof v.families==='object')platformKeys.set(id,{key:v.key,families:v.families,name:QUICK_SOURCES[id].name});}catch{}
  const savePlatformKeys=()=>{try{if(platformKeys.size)localStorage.setItem(platformStorageKey,JSON.stringify(Object.fromEntries(platformKeys)));else localStorage.removeItem(platformStorageKey);}catch{}};
  const rows=()=>[...host.querySelectorAll('.provider-form')];
  const refresh=row=>{
    const player=rowPlayer(row);
    mountModelPicker(row,player,catalog,playerConnection(player));
  };

  // 轮椅模式：选 Key 的来源，粘贴一次就能开玩。
  function updateQuickHint(){
    syncSourcePicker?.();
    const source=QUICK_SOURCES[$('quickSource').value],locked=!!source.unsupported;
    const target=quickKeyPlayerId&&settings.list().find(p=>p.id===quickKeyPlayerId);
    projectRow.hidden=$('quickSource').value!=='vertex';
    if(!projectRow.hidden&&!vertexProject.value){
      const player=settings.list().find(p=>p.id===(quickKeyPlayerId||source.player)&&p.provider==='vertex');
      vertexProject.value=player?.baseUrl.match(/\/projects\/([^/]+)\/locations\/global$/)?.[1]||'';
    }
    $('quickHint').innerHTML=(target?`正在更新「${esc(target.name)}」的 API Key。`:source.hint)+(source.url?` <a href="${source.url}" target="_blank" rel="noopener">去创建 Key ↗</a>`:'');
    $('quickKey').disabled=locked;$('quickSave').disabled=locked||savingQuickKey;
    $('quickKey').placeholder=locked?'请在高级设置中配置':'粘贴你的 '+source.name+' API Key';
  }
  function updateQuickStatus(){
    const players=settings.list(),own=[...new Set(players.filter(p=>p.hasOwnKey&&!isCopy(p)&&!platformKeys.has(p.provider)).map(p=>CHARACTER_MAP[p.characterId]?.name||p.name))];
    const parts=[...(settings.hasSharedKey()?['OpenRouter']:[]),...[...platformKeys.values()].map(p=>p.name),...own];
    $('quickStatus').classList.toggle('connected',parts.length>0);
    $('quickStatus').textContent=parts.length?'已连接：'+parts.join('、')+'。Key 存在这台电脑的浏览器里，刷新不会丢。':'还没有连接任何 AI。';
    $('quickClear').hidden=!parts.length;
  }
  function renderCopies(){
    const list=settings.list(),ready=list.filter(p=>p.ready);
    host.innerHTML=ready.map(settingsRow).join('');
    rows().forEach(refresh);
    const teams=new Map();
    for(const player of ready){
      const id=player.id.replace(/-copy-\d+$/,'');
      if(!teams.has(id))teams.set(id,[]);
      teams.get(id).push(player);
    }
    $('quickCopies').hidden=!ready.length&&!settings.hasSharedKey()&&!platformKeys.size;
    $('quickCopyList').innerHTML=[...teams].map(([id,team])=>{
      const base=team.find(p=>p.id===id),p=base||team[0],n=team.length;
      return `<div class="quick-copy" data-base="${esc(id)}"><div class="quick-copy-head"><span class="quick-copy-name"><i style="background:${esc(p.color)}"></i>${esc(CHARACTER_MAP[p.characterId]?.name||p.name)}</span><span class="stepper"><button data-step="-1" aria-label="少一位" ${!base||n<=1?'disabled':''}>−</button><b>${n}</b><button data-step="1" aria-label="多一位" ${!base||n>=MAX_COPIES?'disabled':''}>＋</button></span><span class="quick-copy-unit">位上场</span></div><div class="quick-names">${team.map(x=>`<input data-rename="${esc(x.id)}" value="${esc(x.name)}" maxlength="40" aria-label="给这位 AI 改名">`).join('')}</div></div>`;
    }).join('');
    const present=new Set(list.map(p=>p.id)),addable=[];
    if(settings.hasSharedKey())for(const c of CHARACTERS)if(!present.has(c.id))addable.push({value:'openrouter:'+c.id,text:c.name+(platformKeys.size?'（OpenRouter）':'')});
    for(const [sourceId,platform] of platformKeys)for(const c of CHARACTERS){const f=platform.families[c.id];if(f&&!present.has(c.id))addable.push({value:sourceId+':'+c.id,text:`${c.name}（${platform.name}${f.vision?'':'，可能看不了图'}）`});}
    $('quickAdd').hidden=!addable.length;
    $('quickAddCharacter').innerHTML=addable.map(o=>`<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('');
    const total=ready.filter(p=>p.enabled).length;
    $('quickCopyTotal').textContent=`共 ${total} 位 AI 上场${total>12?'（同场最多 12 位，开赛前请在大厅少选几位）':''}`;
  }
  $('quickCopyList').onclick=event=>{
    const button=event.target.closest('[data-step]');if(!button)return;
    const team=button.closest('[data-base]');
    const count=team.querySelectorAll('[data-rename]').length;
    try{settings.setCopies(team.dataset.base,count+Number(button.dataset.step));onChange({selectionChanged:true});renderCopies();}
    catch(error){$('quickStatus').textContent=error.message;}
  };
  $('quickCopyList').onchange=event=>{
    const input=event.target.closest('[data-rename]');if(!input)return;
    try{
      const name=input.value.trim();
      settings.rename(input.dataset.rename,name);
      const row=rows().find(row=>row.dataset.id===input.dataset.rename);
      if(row)field(row,'name').value=name;
      input.value=name;
      onChange();
    }
    catch(error){toast(error.message);input.value=settings.list().find(p=>p.id===input.dataset.rename)?.name||'';}
  };
  $('quickCopyList').onkeydown=event=>{if(event.key==='Enter'&&event.target.matches('[data-rename]')){event.preventDefault();event.target.blur();}};
  $('quickAddButton').onclick=()=>{
    try{
      const [sourceId,characterId]=$('quickAddCharacter').value.split(':');
      if(sourceId==='openrouter')settings.ensurePlayer(characterId);
      else connectPlatformPlayers(sourceId,platformKeys.get(sourceId),new Set([characterId]));
      onChange({selectionChanged:true});renderCopies();
    }catch(error){$('quickStatus').textContent=error.message;}
  };
  // 把指定的 AI 接到某个聚合平台：用平台上匹配到的型号和这把 Key。
  function connectPlatformPlayers(sourceId,platform,ids){
    const players=addDefaultPlayers(settings.list(),ids);
    const previousKey=platformKeys.get(sourceId)?.key;
    const connected=new Map();
    for(const player of players){
      const family=platform.families[player.characterId];
      if(ids.has(player.id)&&family){
        connected.set(player.id,{...player,provider:sourceId,baseUrl:PRESETS[sourceId].baseUrl,
          model:family.model,reasoningEffort:'auto',apiKey:platform.key,enabled:true});
      }
    }
    const rows=players.map(player=>{
      const baseId=player.id.replace(/-copy-\d+$/,'');
      const base=connected.get(baseId);
      if(base)return {...base,id:player.id,name:player.name,enabled:baseId===player.id||player.enabled};
      if(previousKey&&player.hasOwnKey&&playerConnection(player).quickId===sourceId&&settings.select([player.id])[0].apiKey===previousKey){
        return {...player,apiKey:platform.key};
      }
      return player;
    });
    settings.save(rows);
  }
  $('quickDone').onclick=()=>dialog.close();
  async function saveQuickKey(){
    const sourceId=$('quickSource').value,source=QUICK_SOURCES[sourceId],key=$('quickKey').value.trim();
    if(source.unsupported||savingQuickKey)return;
    if(!key){$('quickStatus').textContent='请先粘贴 API Key。';$('quickKey').focus();return;}
    let baseUrl=PRESETS[sourceId].baseUrl;
    if(sourceId==='vertex'){
      const project=vertexProject.value.trim();
      if(!/^[a-z0-9][a-z0-9-]*$/.test(project)){
        $('quickStatus').textContent='请填写 Google Cloud 项目 ID。';vertexProject.focus();return;
      }
      baseUrl+='/projects/'+project+'/locations/global';
    }
    if(quickKeyPlayerId){
      try{
        const players=settings.list(),target=players.find(p=>p.id===quickKeyPlayerId);
        if(!target||playerConnection(target).quickId!==sourceId)throw new Error('选手的接入设置已变更，请重新选择。');
        settings.save(players.map(p=>p.id===target.id?{...p,baseUrl,apiKey:key}:p));
        onChange();
        $('quickKey').value='';
        updateQuickStatus();renderCopies();
        toast('已更新这位选手的 API Key。');
      }catch(error){$('quickStatus').textContent=error.message;}
      return;
    }
    if(source.aggregator){
      savingQuickKey=true;
      $('quickSave').disabled=true;$('quickClear').disabled=true;
      $('quickStatus').textContent='正在读取 '+source.name+' 的型号列表…';
      try{
        const families=pickFamilyModels(await fetchPlatformModels(PRESETS[sourceId].baseUrl,key));
        if(!Object.keys(families).length)throw new Error('没在 '+source.name+' 上找到能用的对话型号，可以展开「高级设置」手动填写。');
        const platform={key,families,name:source.name};
        const players=settings.list(),existing=new Set(players.map(p=>p.id));
        const targets=new Set(players.filter(p=>!p.ready&&!isCopy(p)&&families[p.characterId]?.vision).map(p=>p.id));
        for(const player of DEFAULT_PLAYERS){
          if(!existing.has(player.id)&&families[player.characterId]?.vision)targets.add(player.id);
        }
        if(!targets.size&&!players.some(p=>p.ready))targets.add(Object.keys(families)[0]);
        if(targets.size||platformKeys.has(sourceId))connectPlatformPlayers(sourceId,platform,targets);
        platformKeys.set(sourceId,platform);savePlatformKeys();
        onChange({selectionChanged:true});
        if($('quickSource').value===sourceId)$('quickKey').value='';
        updateQuickStatus();renderCopies();
        toast(source.name+(targets.size?' 已连接，可用选手已加入名单。':' 已连接。'));
      }catch(error){$('quickStatus').textContent=error.message;}
      finally{savingQuickKey=false;$('quickClear').disabled=false;updateQuickHint();}
      return;
    }
    try{
      if(sourceId==='openrouter'){
        const reconnect=settings.hasSharedKey();
        const players=settings.list();
        const defaults=new Set(DEFAULT_PLAYERS.map(player=>player.id));
        // 已填写单独 Key 的选手沿用原接口。其余选手接入 OpenRouter 并默认上场。
        const rows=reconnect?players:addDefaultPlayers(players,defaults).map(p=>p.hasOwnKey||p.provider==='mock'?p:{...p,provider:'openrouter',baseUrl:OPENROUTER_BASE,
          model:p.provider==='openrouter'?p.model:DEFAULT_MODELS[p.characterId]||PRESETS.openrouter.model,
          reasoningEffort:p.provider==='openrouter'?p.reasoningEffort:'auto',enabled:true});
        settings.save(rows,{openRouterKey:key});
        onChange({selectionChanged:!reconnect});
        $('quickKey').value='';
        updateQuickStatus();renderCopies();
        toast(reconnect?'已更新 OpenRouter API Key。':'OpenRouter 已连接，可用选手已加入名单。');
        return;
      }else{
        const preset=PRESETS[sourceId];
        settings.ensurePlayer(source.player);
        const players=settings.list(),base=players.find(p=>p.id===source.player);
        const reconnect=playerConnection(base).quickId===sourceId;
        const previousKey=reconnect&&base.hasOwnKey?settings.select([base.id])[0].apiKey:'';
        const rows=players.map(p=>{
          const copy=p.id.startsWith(source.player+'-copy-');
          const inheritsKey=reconnect&&copy&&p.provider===base.provider&&p.baseUrl===base.baseUrl&&
            (!p.hasOwnKey||settings.select([p.id])[0].apiKey===previousKey);
          if(inheritsKey||reconnect&&p.id===base.id){
            return {...p,baseUrl,apiKey:key};
          }
          if(p.id!==source.player)return reconnect?p:{...p,apiKey:'',clearKey:false,enabled:copy||(p.enabled&&p.ready)};
          return {...p,provider:sourceId,baseUrl,model:preset.model,reasoningEffort:'auto',apiKey:key,clearKey:false,enabled:true};
        });
        settings.save(rows);
        if(!reconnect)settings.setCopies(source.player,settings.copiesOf(source.player));
        onChange({selectionChanged:!reconnect||!base.ready});
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
  $('quickSource').onchange=()=>{
    quickKeyPlayerId='';
    $('quickKey').value='';
    vertexProject.value='';
    updateQuickHint();
  };
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
  vertexProject.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('quickKey').focus();}};
  $('quickClear').onclick=()=>{
    try{
      settings.save(settings.list().map(p=>({...p,clearKey:true})),{openRouterKey:''});
      platformKeys.clear();savePlatformKeys();
      onChange();updateQuickStatus();renderCopies();toast('已清除全部 Key。');
    }catch(error){$('quickStatus').textContent=error.message;}
  };
  $('advancedSettings').ontoggle=()=>dialog.classList.toggle('advanced-open',$('advancedSettings').open);
  $('closeSettings').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    $('quickKey').value='';
    vertexProject.value='';
    quickKeyPlayerId='';
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
    const keyButton=event.target.closest('[data-key-source]');
    if(keyButton){
      const sourceId=keyButton.dataset.keySource,source=QUICK_SOURCES[sourceId];
      const row=keyButton.closest('.provider-form');
      const players=settings.list(),player=players.find(p=>p.id===row.dataset.id);
      if(!player||playerConnection(player).quickId!==sourceId){toast('请先保存选手的接入设置。');return;}
      const base=players.find(p=>p.id===source.player);
      const key=player.hasOwnKey?settings.select([player.id])[0].apiKey:'';
      const isDirectGroup=base?.id===player.id||base?.hasOwnKey&&key&&player.id.startsWith(base.id+'-copy-')&&
        base.baseUrl===player.baseUrl&&base.provider===player.provider&&settings.select([base.id])[0].apiKey===key;
      const platform=platformKeys.get(sourceId);
      const usesPlatformKey=platform&&key===platform.key;
      const usesSharedKey=sourceId==='openrouter'&&!player.hasOwnKey;
      quickKeyPlayerId=isDirectGroup||usesPlatformKey||usesSharedKey?'':player.id;
      $('quickKey').value='';
      vertexProject.value='';
      $('quickSource').value=sourceId;
      updateQuickHint();
      $('quickKey').focus();
      $('quickKey').scrollIntoView({block:'center'});
      return;
    }
    event.target.closest('[data-remove]')?.closest('.provider-form').remove();
  };
  $('saveSettings').onclick=()=>{
    try{
      const current=settings.list();
      const edits=new Map(rows().map(row=>[row.dataset.id,rowPlayer(row)]));
      const input=current.flatMap(player=>{
        const edit=edits.get(player.id);
        edits.delete(player.id);
        if(edit)return [{...edit,color:player.color}];
        return player.ready?[]:[player];
      });
      const saved=settings.save([...input,...edits.values()]);
      onChange({selectionChanged:true});
      dialog.close();
      toast(saved?'AI 设置已保存。':'AI 设置已在本页生效。');
    }catch(error){$('settingsStatus').textContent=error.message;}
  };
  $('addPlayer').onclick=()=>{
    const unconnected=settings.list().filter(p=>!p.ready).length;
    if(rows().length+unconnected>=MAX_STORED){$('settingsStatus').textContent=`最多配置 ${MAX_STORED} 位 AI。`;return;}
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
