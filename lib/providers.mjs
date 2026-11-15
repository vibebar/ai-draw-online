import {parseJSON} from './shapes.mjs';
import {CHARACTERS,characterPrompt} from '../characters.mjs';
import {DEFAULT_MODELS,OPENROUTER_BASE} from './default-models.mjs';
import {QWEN_BASE,qwenProfile} from './qwen-models.mjs';
import {modelCatalog} from './model-catalog.mjs';
import {modelSource,resolveEffort,validateControls,waitSeconds,compatibleKimiProfile,isVertexGemini4,vertexAutoThinking} from '../reasoning.mjs';

export const PRESETS = {
  openrouter:{label:'OpenRouter（默认）',baseUrl:OPENROUTER_BASE,model:DEFAULT_MODELS.chatgpt},
  openai:{label:'OpenAI API',baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol'},
  anthropic:{label:'Anthropic 兼容接口',baseUrl:'https://api.anthropic.com/v1',model:'claude-opus-5-5'},
  gemini:{label:'Gemini API',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash'},
  vertex:{label:'Google Cloud / Vertex AI',baseUrl:'https://aiplatform.googleapis.com/v1',model:'gemini-4-hydrogen',hint:'接口基础地址填到 /v1/projects/项目ID/locations/global，并使用同一项目绑定服务账号的 Vertex AI API Key。'},
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
    if(signal?.aborted)return reject(signal.reason);
    const cancel=()=>{const i=pool.queue.indexOf(entry);if(i>=0){pool.queue.splice(i,1);reject(signal.reason);}};
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

const guessProperties={
  guess:{type:'string',description:'One guess for the drawing'},
  reason:{type:'string',description:'Visual evidence in 30 Chinese characters or fewer'},
  confidence:{type:'integer',minimum:0,maximum:100}
};
const guessFields=Object.keys(guessProperties);
const guessSchema={type:'object',properties:guessProperties,required:guessFields,additionalProperties:false};
const vertexGuessSchema={
  type:'OBJECT',
  properties:Object.fromEntries(Object.entries(guessProperties).map(([field,property])=>[field,{...property,type:property.type.toUpperCase()}])),
  required:guessFields,
  propertyOrdering:guessFields
};

function decodeImageDataUrl(image) {
  const match=/^data:(image\/[^;,]+);base64,(.+)$/.exec(image);
  if(!match)throw new Error('画板图片格式无效。');
  return {mimeType:match[1],data:match[2]};
}

export function buildRequest(p,prompt,image,profile=qwenProfile(p),taskType) {
  const base=normalizeBaseUrl(p.baseUrl),url=new URL(base);
  const headers={'Content-Type':'application/json'};const key=p.apiKey;
  const shortTask=taskType==='guess'||taskType==='vote'||(taskType===undefined&&Boolean(image));
  if(p.provider==='vertex'){
    headers['x-goog-api-key']=key;
    const parts=[{text:prompt}];
    if(image)parts.push({inlineData:decodeImageDataUrl(image)});
    const generationConfig={responseMimeType:'application/json'};
    const thinkingLevel=vertexAutoThinking(p,taskType);
    if(thinkingLevel)generationConfig.thinkingConfig={thinkingLevel};
    if(taskType==='guess'&&isVertexGemini4(p)){
      generationConfig.responseSchema=vertexGuessSchema;
      if(thinkingLevel==='LOW')generationConfig.maxOutputTokens=1024;
    }
    return {
      url:base+'/publishers/google/models/'+encodeURIComponent(p.model)+':generateContent',
      headers,
      body:{contents:[{role:'user',parts}],generationConfig}
    };
  }
  if(p.provider==='anthropic') {
    headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    if(url.origin==='https://api.anthropic.com')headers['anthropic-dangerous-direct-browser-access']='true';
    // Native Claude may spend output tokens on thinking before returning the game's JSON.
    const content=[];
    if(image){
      const {mimeType,data}=decodeImageDataUrl(image);
      content.push({type:'image',source:{type:'base64',media_type:mimeType,data}});
    }
    content.push({type:'text',text:prompt});
    const body={model:p.model,max_tokens:shortTask?8192:16384,messages:[{role:'user',content}]};
    const kimi=compatibleKimiProfile(p);
    if(kimi){
      const effort=resolveEffort(p,kimi);
      body.max_tokens=shortTask?32768:65536;
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
    body.max_tokens=effort==='none'?(shortTask?2048:8192):(shortTask?32768:65536);
  }
  if(base===OPENROUTER_BASE){
    // Reasoning and visible output share the router's token ceiling. Higher effort needs headroom.
    const deep=['medium','high','xhigh','max','ultra','enabled','default'].includes(effort);
    body.max_tokens=deep?(shortTask?32768:65536):(shortTask?4096:12288);
    if(taskType==='guess'){
      if(effort==='none')body.max_tokens=256;
      else if(['minimal','low'].includes(effort))body.max_tokens=1024;
    }
    const supported=profile?.supportedParameters||[];
    if(taskType==='guess'&&supported.includes('structured_outputs')){
      body.response_format={type:'json_schema',json_schema:{name:'drawing_guess',strict:true,schema:guessSchema}};
    }else if(supported.includes('response_format')){
      body.response_format={type:'json_object'};
    }
    if(effort==='none')body.reasoning={enabled:false,exclude:true};
    else if(effort!=='default')body.reasoning=effort==='enabled'?{enabled:true,exclude:true}:{effort,exclude:true};
  }
  return {url:base+'/chat/completions',headers,body};
}
function extractResponse(p,data) {
  if(p.provider==='vertex')return (data.candidates?.[0]?.content?.parts||[]).filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('');
  if(p.provider==='anthropic')return (data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');
  if(['openai','grok'].includes(p.provider))return data.output_text||(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const c=data.choices?.[0]?.message?.content;return typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join(''):'';
}

const hardQuotaCodes=new Set([
  'insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded',
  'project_spend_limit_exceeded','organization_usage_limit_exceeded'
]);
function quotaMessage(error) {
  if(error?.metadata?.limit_source==='openrouter_free_tier_daily')return 'OpenRouter 免费模型今日请求额度已用完';
  if(hardQuotaCodes.has(error?.code)||hardQuotaCodes.has(error?.type))return '账户额度或消费限额已用完';
  return null;
}

function retryDelay(headers,source) {
  const retryAfter=headers?.get('Retry-After')?.trim();
  if(retryAfter){
    if(/^\d+(?:\.\d+)?$/.test(retryAfter))return Number(retryAfter)*1000;
    const date=Date.parse(retryAfter);
    if(Number.isFinite(date))return Math.max(0,date-Date.now());
  }
  const jitter=Math.random()*500;
  if(source==='openrouter'){
    const reset=headers?.get('X-RateLimit-Reset');
    if(reset&&Number.isFinite(Number(reset)))return Math.max(0,Number(reset)-Date.now())+jitter;
  }
  return 1500+jitter;
}

function waitForRetry(delay,signal) {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const cancel=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},delay);
    signal.addEventListener('abort',cancel,{once:true});
  });
}

export async function callModel(player,prompt,image,signal,{onProgress=()=>{},taskType}={}) {
  onProgress('queued');
  if(player.provider==='mock')return mockReply(prompt,signal);
  const source=modelSource(player);
  const profile=source==='qwen'?qwenProfile(player):source==='openrouter'?
    (await modelCatalog()).models.find(model=>model.source===source&&model.id===player.model):null;
  validateControls(player,profile);
  const waitMs=waitSeconds(player)*1000;
  try {
    const request=buildRequest(player,characterPrompt(player,prompt),image,profile,taskType);
    const payload=JSON.stringify(request.body);
    let start,requestSignal;
    for(let attempt=0;;attempt++){
      await slot(requestSignal??signal,pool);
      let response,data;
      try {
        if(!requestSignal){
          start=performance.now();
          const timeout=AbortSignal.timeout(waitMs);
          requestSignal=signal?AbortSignal.any([timeout,signal]):timeout;
        }
        requestSignal.throwIfAborted();
        onProgress('running');
        response=await fetch(request.url,{
          method:'POST',headers:request.headers,body:payload,
          credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:requestSignal
        });
        data=await response.json().catch(()=>{requestSignal.throwIfAborted();return null;});
        requestSignal.throwIfAborted();
      } finally {
        release(pool);
      }
      if(!response.ok||data?.error){
        const status=response.ok?Number(data.error.code)||response.status:response.status;
        const quota=quotaMessage(data?.error);
        const message=quota||({400:'请核对型号、图片输入和思考档位',401:'API Key 无效',402:'余额不足，或这个型号要付费（OpenRouter 免费额度用不了）',403:'API Key 或模型权限不足',404:'模型或接口地址不存在',429:'额度不足或请求过快'}[status])||'模型服务未能完成请求';
        const error=new Error('API '+status+'：'+message+'。');
        if(status!==429||quota||attempt>0)throw error;
        const delay=retryDelay(response.headers,source);
        if(delay>=waitMs-(performance.now()-start))throw error;
        onProgress('queued');
        await waitForRetry(delay,requestSignal);
        continue;
      }
      if(!data)throw new Error('接口没有返回有效的 JSON。');
      const finishReason=data.choices?.[0]?.finish_reason||data.stop_reason||data.candidates?.[0]?.finishReason;
      if(['length','max_tokens','MAX_TOKENS','CONTINUATION'].includes(finishReason)||data.incomplete_details?.reason==='max_output_tokens'){
        throw new Error(player.provider==='vertex'?'模型回复达到长度上限。':'模型回复达到长度上限，可降低思考强度后重试。');
      }
      const content=extractResponse(player,data);
      if(!content)throw new Error('模型没有返回文本，请核对型号能力。');
      return {...parseJSON(content),elapsed:Math.round(performance.now()-start)};
    }
  } catch(error){
    if(signal?.aborted||error.name==='AbortError')throw new Error('已取消。');
    if(error.name==='TimeoutError')throw new Error('接口等待超过 '+waitSeconds(player)+' 秒，可调整最长等待时间后重试。');
    if(error instanceof TypeError)throw new Error('浏览器连接不到模型接口。请检查网络、接口地址和平台的跨域支持。');
    throw error;
  }
}

// 测试选手：不联网，画一道横线、猜「1」，其他环节给一句固定回复，方便把整局流程走通。
async function mockReply(prompt,signal){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,300);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new Error('已取消。'));},{once:true});});
  const line=[{type:'line',points:[[200,325],[800,325]],color:'#202633',width:6}];
  const target=(prompt.match(/"playerId":"([^"]+)"/)||prompt.match(/"id":"([^"]+)"/)||[])[1]||'';
  return {hint:null,hints:{},shapes:line,undo:0,append:[],guess:'1',reason:'测试选手',confidence:0,summary:'测试选手不复盘。',line:'测试选手路过。',reflection:'测试通过。',pass:true,targetId:target,elapsed:300};
}
