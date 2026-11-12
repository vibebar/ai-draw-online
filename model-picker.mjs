import {modelSource,chosenEffort,waitSeconds,effortChoices,EFFORT_LABELS,WAIT_SECONDS,reasoningSummary,compatibleKimiProfile} from './reasoning.mjs';
export {modelSource} from './reasoning.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function matchingModels(p,catalog,showText=false){
  const source=modelSource(p),family=p.characterId==='none'?null:p.characterId;
  return (catalog?.models||[]).filter(m=>m.source===source&&(!family||m.family===family)&&(m.id===p.model||m.gameDrawing&&(showText||m.vision)));
}
const dollars=n=>n===null?'—':'$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);
export function mountModelPicker(row,p,catalog){
  const host=row.querySelector('.model-picker'),showText=row.dataset.showText==='true',manualOpen=host.querySelector('.model-manual')?.open;
  const options=matchingModels(p,catalog,showText),source=modelSource(p),selected=catalog?.models?.find(m=>m.source===source&&m.id===p.model)||compatibleKimiProfile(p);
  const vision=selected?.vision?'目录支持识图':selected?.visionUnknown?'识图能力待确认':selected?'不支持识图':'识图能力待确认';
  const id=esc(p.id),hasCurrent=options.some(m=>m.id===p.model);
  const efforts=effortChoices(selected),effort=chosenEffort(p);
  const sources=['openrouter','qwen'].filter(s=>s===source||catalog?.models?.some(m=>m.source===s&&(p.characterId==='none'||m.family===p.characterId)&&m.vision&&m.gameDrawing));
  host.innerHTML=`<label>接入平台<select data-route-choice aria-label="${esc(p.name)}接入平台">${!source?'<option value="" selected>当前自定义接口</option>':''}${sources.map(s=>`<option value="${s}" ${s===source?'selected':''}>${{qwen:'千问平台',openrouter:'OpenRouter'}[s]}</option>`).join('')}</select></label><label class="model-select-label">选择型号<select data-model-choice aria-label="${esc(p.name)}型号"><option value="" ${!p.model?'selected':''} disabled>请选择型号</option>${!hasCurrent&&p.model?`<option value="${esc(p.model)}" selected>${esc(p.model)}（当前型号）</option>`:''}${options.map(m=>`<option value="${esc(m.id)}" ${m.id===p.model?'selected':''}>${esc(m.name)}${!m.vision?' · 仅文字':''}</option>`).join('')}</select></label>
    <div class="model-badges"><span class="${selected&&!selected.vision?'unsupported':''}">${vision}</span></div>
    <p class="model-id">${esc(p.model||'尚未选择型号')}</p>
    <p class="model-price">${source==='qwen'?`千问平台按量计费（人民币） · <a href="${esc(selected?.reference||'https://www.qianwenai.com/models')}" target="_blank" rel="noopener">查看官方能力与价格 ↗</a>`:selected?`每百万文字 token：输入 ${dollars(selected.inputPrice)} / 输出 ${dollars(selected.outputPrice)}（美元；图片另按平台计费）`:'未取得该型号价格'}${selected?.imageGeneration?' · 原生生图型号不适合当前笔画协议':''}</p>
    ${['openrouter','qwen'].includes(source)?`<label class="check model-filter"><input type="checkbox" data-show-text ${showText?'checked':''}> 也显示仅文字型号（不能看图猜题）</label>`:''}
    <div class="provider-grid model-controls"><label>思考强度<select data-field="reasoningEffort" aria-label="${esc(p.name)}思考强度">${!efforts.includes(effort)?`<option value="${esc(effort)}" selected>${esc(EFFORT_LABELS[effort]||effort)} · 请核对型号支持</option>`:''}${efforts.map(value=>`<option value="${value}" ${effort===value?'selected':''}>${EFFORT_LABELS[value]}</option>`).join('')}</select></label><label>最长等待<select data-field="timeoutSeconds" aria-label="${esc(p.name)}最长等待">${WAIT_SECONDS.map(n=>`<option value="${n}" ${waitSeconds(p)===n?'selected':''}>${n} 秒</option>`).join('')}</select></label></div>
    <p class="model-notice">${esc(reasoningSummary(p,selected))} 等待上限从请求发出后开始计时。</p>
    ${source==='qwen'?`<p class="model-notice">千问平台型号 · 官方资料核对于 2026-10-09。列表不代表账户权限，第三方直供型号可能需先在千问平台开通。</p>`:''}
    <details class="model-manual" ${manualOpen||!source?'open':''}><summary>手动填写型号 ID</summary><label for="model-${id}" class="sr-only">模型 ID</label><input id="model-${id}" data-field="model" value="${esc(p.model)}" placeholder="厂商提供的完整模型 ID" autocomplete="off"></details>
    ${!options.length?`<p class="model-notice">${catalog?'此接入方式暂无可选目录，可保留或手动填写型号。':'正在读取型号目录；当前配置可以保留。'}</p>`:''}`;
}
