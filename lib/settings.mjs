import {CHARACTER_MAP} from '../characters.mjs';
import {EFFORT_LABELS,WAIT_SECONDS} from '../reasoning.mjs';
import {DEFAULT_PLAYERS,PRESETS,normalizeBaseUrl} from './providers.mjs';
import {OPENROUTER_BASE} from './default-models.mjs';

export const MAX_STORED=40, MAX_COPIES=8;
const copyPrefix=id=>id+'-copy-';
export const isCopy=player=>/-copy-\d+$/.test(player.id);
// 测试选手只在本机开发地址或网址带 ?test 时出现。
export const isTestHost=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).has('test');
const TEST_PLAYER={id:'tester',name:'测试选手',characterId:'none',provider:'mock',baseUrl:'https://test.invalid',model:'test',color:'#8a8f9c',reasoningEffort:'auto',timeoutSeconds:180,enabled:true};
export const preferencePrefix='aidraw:'+new URL('.',location.href).pathname+':';

function normalizePlayers(rows) {
  if (!Array.isArray(rows)||rows.length<1||rows.length>MAX_STORED) throw new Error(`请保留 1–${MAX_STORED} 位 AI。`);
  const ids=new Set();
  return rows.map((row,index)=>{
    const {id,provider}=row;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)||id==='human'||ids.has(id)) throw new Error('选手标识无效。');
    ids.add(id);
    if (!Object.hasOwn(PRESETS,provider)) throw new Error('接口类型无效。');
    const name=row.name.trim(),model=row.model.trim();
    if (!name||name.length>40) throw new Error('选手名称须为 1–40 字。');
    if (!model||model.length>160) throw new Error(name+'：请填写有效的模型 ID。');
    const baseUrl=normalizeBaseUrl(row.baseUrl.trim());
    const characterId=Object.hasOwn(CHARACTER_MAP,row.characterId)?row.characterId:'none';
    const color=/^#[a-f0-9]{6}$/i.test(row.color)?row.color:DEFAULT_PLAYERS[index%DEFAULT_PLAYERS.length].color;
    const reasoningEffort=Object.hasOwn(EFFORT_LABELS,row.reasoningEffort)?row.reasoningEffort:'auto';
    const timeoutSeconds=WAIT_SECONDS.includes(row.timeoutSeconds)?row.timeoutSeconds:180;
    return {id,name,model,provider,baseUrl,characterId,color,reasoningEffort,timeoutSeconds,enabled:!!row.enabled};
  });
}

export function createSettings() {
  const storageKey=preferencePrefix+'players-v2';
  // 默认只放一个 DeepSeek 作为示例，其他 AI 在连接或添加时再创建。
  let players=structuredClone(DEFAULT_PLAYERS.filter(p=>p.id==='deepseek')).map(p=>({...p,enabled:true})), sharedKey='';
  let keys=new Map();
  try {
    const saved=localStorage.getItem(storageKey);
    if(saved)players=normalizePlayers(JSON.parse(saved));
  } catch {}
  // Key 只存在这台电脑的浏览器里，刷新后自动读回；用户用完可在设置里清除。
  const keysStorageKey=preferencePrefix+'keys-v1';
  try {
    const saved=JSON.parse(localStorage.getItem(keysStorageKey)||'{}');
    if(typeof saved.shared==='string')sharedKey=saved.shared.slice(0,1000);
    for(const [id,value] of Object.entries(saved.own||{}))if(typeof value==='string'&&value&&players.some(p=>p.id===id))keys.set(id,value.slice(0,1000));
  } catch {}
  if(isTestHost()){if(!players.some(p=>p.provider==='mock'))players=[...players,{...TEST_PLAYER}];}
  else players=players.filter(p=>p.provider!=='mock');

  const persist=()=>{try { localStorage.setItem(storageKey,JSON.stringify(players)); } catch {}};
  const persistKeys=()=>{try { if(sharedKey||keys.size)localStorage.setItem(keysStorageKey,JSON.stringify({shared:sharedKey,own:Object.fromEntries(keys)})); else localStorage.removeItem(keysStorageKey); } catch {}};
  const usesOpenRouter=player=>player.baseUrl===OPENROUTER_BASE&&['openrouter','compatible'].includes(player.provider);
  const needsKey=player=>player.provider!=='mock'&&(player.provider!=='compatible'||usesOpenRouter(player));
  const keyFor=player=>keys.get(player.id)||(usesOpenRouter(player)?sharedKey:'');
  const list=()=>players.map(player=>({
    ...player,
    hasKey:!!keyFor(player),
    hasOwnKey:keys.has(player.id),
    ready:!needsKey(player)||!!keyFor(player)
  }));

  return {
    list,
    hasSharedKey:()=>!!sharedKey,
    setSharedKey(input) {
      const value=input.trim();
      if(value.length>1000)throw new Error('API Key 过长。');
      sharedKey=value;persistKeys();
    },
    save(rows) {
      const next=normalizePlayers(rows), nextKeys=new Map();
      for(const [index,player] of next.entries()){
        const row=rows[index],old=players.find(p=>p.id===player.id);
        const sameDestination=old?.baseUrl===player.baseUrl&&old.provider===player.provider;
        const value=String(row.apiKey||'').trim();
        if(value.length>1000)throw new Error(player.name+'：API Key 过长。');
        const key=row.clearKey?'':value||(sameDestination?keys.get(player.id):'');
        if(key)nextKeys.set(player.id,key);
      }
      players=next;
      keys=nextKeys;persistKeys();
      try { localStorage.setItem(storageKey,JSON.stringify(players)); }
      catch { return false; }
      return true;
    },
    copiesOf(baseId) {
      return 1+players.filter(p=>p.id.startsWith(copyPrefix(baseId))).length;
    },
    // 同一把 Key 让同一个 AI 多上场几位：复制出的选手沿用本体的接口、型号和本页 Key。
    setCopies(baseId,count) {
      const base=players.find(p=>p.id===baseId);
      if(!base||isCopy(base))throw new Error('选手不存在。');
      count=Math.max(1,Math.min(MAX_COPIES,Math.round(count)));
      const prefix=copyPrefix(baseId),rest=players.filter(p=>!p.id.startsWith(prefix));
      const copies=Array.from({length:count-1},(_,i)=>{const id=prefix+(i+2),old=players.find(p=>p.id===id);return {...base,id,name:old?.name||`${base.name} ${i+2}`,enabled:old?old.enabled:true};});
      const index=rest.findIndex(p=>p.id===baseId);
      const next=normalizePlayers([...rest.slice(0,index),{...base,enabled:true},...copies,...rest.slice(index+1)]);
      for(const id of [...keys.keys()])if(id.startsWith(prefix))keys.delete(id);
      const key=keys.get(baseId);
      if(key)for(const copy of copies)keys.set(copy.id,key);
      players=next;
      persist();persistKeys();
    },
    rename(id,input) {
      const name=String(input||'').trim(),player=players.find(p=>p.id===id);
      if(!player)throw new Error('选手不存在。');
      if(!name||name.length>40)throw new Error('名字须为 1–40 字。');
      player.name=name;persist();
    },
    // 按角色补一位选手（沿用默认的 OpenRouter 型号），已存在则直接返回它。
    ensurePlayer(characterId) {
      const existing=players.find(p=>p.id===characterId);
      if(existing)return existing.id;
      const template=DEFAULT_PLAYERS.find(p=>p.id===characterId);
      if(!template)throw new Error('没有这个角色。');
      players=normalizePlayers([...players,{...structuredClone(template),enabled:true}]);
      persist();
      return characterId;
    },
    select(ids) {
      if(!ids.length||new Set(ids).size!==ids.length)throw new Error('请至少选择一位 AI。');
      return ids.map(id=>{
        const player=players.find(item=>item.id===id);
        if(!player)throw new Error('选手不存在。');
        const apiKey=keyFor(player);
        if(needsKey(player)&&!apiKey)throw new Error(player.name+' 尚未填写 API Key。');
        return {...player,apiKey};
      });
    }
  };
}
