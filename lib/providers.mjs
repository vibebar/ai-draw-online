import {parseJSON} from './shapes.mjs';
import {CHARACTERS,characterPrompt} from '../characters.mjs';
import {DEFAULT_MODELS,OPENROUTER_BASE} from './default-models.mjs';
import {QWEN_BASE,qwenProfile} from './qwen-models.mjs';
import {modelCatalog} from './model-catalog.mjs';
import {modelSource,resolveEffort,validateControls,waitSeconds,compatibleKimiProfile} from '../reasoning.mjs';

export const PRESETS = {
  openrouter:{label:'OpenRouter（默认）',baseUrl:OPENROUTER_BASE,model:DEFAULT_MODELS.chatgpt},
  openai:{label:'OpenAI API',baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol'},
  anthropic:{label:'Anthropic 兼容接口',baseUrl:'https://api.anthropic.com/v1',model:'claude-opus-5-5'},
  gemini:{label:'Gemini API',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash'},
  glm:{label:'智谱 GLM API',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.6v-flash'},
  deepseek:{label:'DeepSeek API',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
  grok:{label:'Grok API',baseUrl:'https://api.x.ai/v1',model:'grok-4.7'},
  kimi:{label:'Kimi API',baseUrl:'https://api.moonshot.ai/v1',model:'kimi-k2.5'},
  qwen:{label:'千问 API',baseUrl:QWEN_BASE,model:'qwen3.8-flash',hint:'默认用于千问 AI 平台的按量付费 Key。若使用百炼，请改填百炼控制台提供的完整地址，不要保留示例占位符。'},
  doubao:{label:'豆包 API',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seed-2-1-lite-260915'},
  siliconflow:{label:'硅基流动',baseUrl:'https://api.siliconflow.cn/v1',model:''},
  bailian:{label:'阿里云百炼',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:''},
  ark:{label:'火山方舟',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',model:''},
  mock:{label:'测试选手（不调用接口）',baseUrl:'https://test.invalid',model:'test'},
  compatible:{label:'OpenAI 兼容接口',baseUrl:'',model:''}
};
export const DEFAULT_PLAYERS = CHARACTERS.map(c=>({id:c.id,name:c.name,characterId:c.id,provider:'openrouter',baseUrl:OPENROUTER_BASE,model:DEFAULT_MODELS[c.id],enabled:c.id==='chatgpt',color:c.color,reasoningEffort:'auto',timeoutSeconds:180}));

const pool={active:0,limit:12,queue:[]};
function drain(pool){while(pool.active<pool.limit&&pool.queue.length)pool.queue.shift().start();}
function slot(signal,pool){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('已取消'));
    const cancel=()=>{const i=pool.queue.indexOf(entry);if(i>=0){pool.queue.splice(i,1);reject(new Error('已取消'));}};
    const entry={start:()=>{signal?.removeEventListener('abort',cancel);pool.active++;resolve();}};
    pool.queue.push(entry);signal?.addEventListener('abort',cancel,{once:true});drain(pool);
  });
}
function release(pool){pool.active--;drain(pool);}


export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('请填写完整的 HTTPS 接口基础地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('接口基础地址须使用 HTTPS，并且不能包含账号、查询参数或片段。');
  }
  if (/%7[bd]|[{}]/i.test(url.pathname)) throw new Error('请用实际地址替换接口地址中的占位符。');
  return url.href.replace(/\/+$/, '');
}

export function buildRequest(p,prompt,image,profile=qwenProfile(p)) {
  const base=normalizeBaseUrl(p.baseUrl),url=new URL(base);
  const headers={'Content-Type':'application/json'};const key=p.apiKey;
  if(p.provider==='anthropic') {
    headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    if(url.origin==='https://api.anthropic.com')headers['anthropic-dangerous-direct-browser-access']='true';
    // Native Claude may spend output tokens on thinking before returning the game's JSON.
    const body={model:p.model,max_tokens:image?8192:16384,messages:[{role:'user',content:[...(image?[{type:'image',source:{type:'base64',media_type:'image/png',data:image.split(',')[1]}}]:[]),{type:'text',text:prompt}]}]};
    const kimi=compatibleKimiProfile(p);
    if(kimi){
      const effort=resolveEffort(p,kimi);
      body.max_tokens=image?32768:65536;
      if(effort!=='default')body.output_config={effort};
    }
    return {url:base+'/messages',headers,body};
  }
  if(key)headers.Authorization='Bearer '+key;
  if(['openai','grok'].includes(p.provider))return {url:base+'/responses',headers,body:{model:p.model,store:false,input:[{role:'user',content:[{type:'input_text',text:prompt},...(image?[{type:'input_image',image_url:image}]:[])]}]}};
  const body={model:p.model,messages:[{role:'user',content:[{type:'text',text:prompt},...(image?[{type:'image_url',image_url:{url:image}}]:[])]}]};
  const effort=resolveEffort(p,profile);
  if(url.hostname==='maas.qianwenaiapi.com'&&profile?.source==='qwen'){
    if(effort==='none')body.enable_thinking=false;
    else if(effort!=='default'){body.enable_thinking=true;if(effort!=='enabled')body.reasoning_effort=effort;}
    if(effort==='none')body.response_format={type:'json_object'};
    body.max_tokens=effort==='none'?(image?2048:8192):(image?32768:65536);
  }
  if(base===OPENROUTER_BASE){
    // Reasoning and visible output share the router's token ceiling. Higher effort needs headroom.
    const deep=['medium','high','xhigh','max','ultra','enabled','default'].includes(effort);
    body.max_tokens=deep?(image?32768:65536):image?4096:12288;
    body.response_format={type:'json_object'};
    if(effort==='none')body.reasoning={enabled:false,exclude:true};
    else if(effort!=='default')body.reasoning=effort==='enabled'?{enabled:true,exclude:true}:{effort,exclude:true};
  }
  return {url:base+'/chat/completions',headers,body};
}
function extractResponse(p,data) {
  if(p.provider==='anthropic')return (data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');
  if(['openai','grok'].includes(p.provider))return data.output_text||(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const c=data.choices?.[0]?.message?.content;return typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join(''):'';
}

export async function callModel(player,prompt,image,signal,{onProgress=()=>{}}={}) {
  onProgress('queued');
  if(player.provider==='mock')return mockReply(prompt,signal);
  const source=modelSource(player);
  const profile=source==='qwen'?qwenProfile(player):source==='openrouter'?
    (await modelCatalog()).models.find(model=>model.source===source&&model.id===player.model):null;
  validateControls(player,profile);
  await slot(signal,pool);
  const start=Date.now();
  try {
    signal?.throwIfAborted();
    onProgress('running');
    const request=buildRequest(player,characterPrompt(player,prompt),image,profile);
    const timeout=AbortSignal.timeout(waitSeconds(player)*1000);
    const response=await fetch(request.url,{
      method:'POST',headers:request.headers,body:JSON.stringify(request.body),
      credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
      signal:signal?AbortSignal.any([timeout,signal]):timeout
    });
    const data=await response.json().catch(error=>{
      if(error.name==='AbortError'||error.name==='TimeoutError')throw error;
      return null;
    });
    if(!response.ok||data?.error){
      const status=response.ok?Number(data.error.code)||response.status:response.status;
      const message={400:'请核对型号、图片输入和思考档位',401:'API Key 无效',402:'余额不足，或这个型号要付费（OpenRouter 免费额度用不了）',403:'API Key 或模型权限不足',404:'模型或接口地址不存在',429:'额度不足或请求过快'}[status]||'模型服务未能完成请求';
      throw new Error('API '+status+'：'+message+'。');
    }
    if(!data)throw new Error('接口没有返回有效的 JSON。');
    if(['length','max_tokens'].includes(data.choices?.[0]?.finish_reason||data.stop_reason)||data.incomplete_details?.reason==='max_output_tokens'){
      throw new Error('模型回复达到长度上限，可降低思考强度后重试。');
    }
    const content=extractResponse(player,data);
    if(!content)throw new Error('模型没有返回文本，请核对型号能力。');
    return {...parseJSON(content),elapsed:Date.now()-start};
  } catch(error){
    if(error.name==='TimeoutError')throw new Error('接口等待超过 '+waitSeconds(player)+' 秒，可调整最长等待时间后重试。');
    if(error.name==='AbortError')throw new Error('已取消。');
    if(error instanceof TypeError)throw new Error('浏览器连接不到模型接口。请检查网络、接口地址和平台的跨域支持。');
    throw error;
  } finally {
    release(pool);
  }
}

// 测试选手：不联网，画一道横线、猜「1」，其他环节给一句固定回复，方便把整局流程走通。
async function mockReply(prompt,signal){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,300);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new Error('已取消。'));},{once:true});});
  const line=[{type:'line',points:[[200,325],[800,325]],color:'#202633',width:6}];
  const target=(prompt.match(/"playerId":"([^"]+)"/)||prompt.match(/"id":"([^"]+)"/)||[])[1]||'';
  return {hint:null,hints:{},shapes:line,undo:0,append:[],guess:'1',reason:'测试选手',confidence:0,summary:'测试选手不复盘。',line:'测试选手路过。',reflection:'测试通过。',pass:true,targetId:target,elapsed:300};
}
