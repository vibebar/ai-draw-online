import {QWEN_MODELS} from './qwen-models.mjs';
import {OPENROUTER_BASE} from './default-models.mjs';

const families={'anthropic':'claude','google':'gemini','deepseek':'deepseek','z-ai':'glm','x-ai':'grok','moonshotai':'kimi','qwen':'qwen','bytedance-seed':'doubao','openai':'chatgpt','minimax':'minimax','xiaomi':'mimo'};
const price=value=>value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value)*1e6:null;
export function routerModels(data){
  return (data||[]).filter(m=>typeof m.id==='string'&&families[m.id.split('/')[0]]&&(!m.id.startsWith('google/')||m.id.startsWith('google/gemini'))&&!m.id.includes(':batch')&&m.architecture?.output_modalities?.includes('text')).map(m=>{
    const inputs=m.architecture.input_modalities||[],outputs=m.architecture.output_modalities||[];
    return {id:m.id,name:m.name||m.id,family:families[m.id.split('/')[0]],source:'openrouter',vision:inputs.includes('image'),gameDrawing:outputs.length===1&&outputs[0]==='text',imageGeneration:outputs.includes('image'),inputPrice:price(m.pricing?.prompt),outputPrice:price(m.pricing?.completion),created:m.created||0,reasoning:m.reasoning||null,supportedParameters:m.supported_parameters||[]};
  }).sort((a,b)=>b.created-a.created||a.name.localeCompare(b.name));
}

let cached, pending;

export function modelCatalog() {
  if (cached && Date.now() - cached.fetchedAt < 30 * 60_000) return Promise.resolve(cached);
  pending ??= loadCatalog().finally(() => { pending = null; });
  return pending;
}

async function loadCatalog() {
  let models = [], warning = '';
  try {
    const response = await fetch(OPENROUTER_BASE + '/models', {
      credentials: 'omit', signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error('目录暂时不可用');
    models = routerModels((await response.json()).data);
    if (!models.length) throw new Error('目录为空');
  } catch {
    warning = 'OpenRouter 实时目录暂不可用，可参考随附目录或手动填写型号。';
    try {
      const response = await fetch(new URL('../data/openrouter-models.json', import.meta.url));
      if (response.ok) models = routerModels((await response.json()).data);
    } catch {}
  }
  cached = { models: [...QWEN_MODELS, ...models], warning, fetchedAt: Date.now() };
  return cached;
}
