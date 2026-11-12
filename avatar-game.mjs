import {CHARACTERS,CHARACTER_MAP,portraitPage} from './characters.mjs';
export function createCompanion(){
 const panel=document.createElement('section');panel.className='companion';panel.setAttribute('aria-label','角色立绘');
 panel.innerHTML='<img class="companion-portrait"><div class="companion-copy"><select aria-label="陪伴角色"></select><h3></h3><p class="companion-status" role="status"></p><a>查看立绘 ↗</a></div>';
 document.getElementById('lobby').append(panel);
 const img=panel.querySelector('img'),select=panel.querySelector('select'),status=panel.querySelector('p');
 for(const c of CHARACTERS)select.add(new Option(c.name,c.id));select.value='deepseek';
 function show(){const c=CHARACTER_MAP[select.value];img.alt=c.name+' 的角色立绘';img.onload=()=>{status.textContent=c.lines.idle;};img.onerror=()=>{status.textContent='立绘加载失败，请刷新重试。';};img.src=c.imageUrl;panel.querySelector('h3').textContent=c.name;panel.querySelector('a').href=portraitPage(c.id);}
 select.onchange=show;show();return {update(game){panel.hidden=!!game;}};
}
