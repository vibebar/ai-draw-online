import {renderCharacterCards} from './characters-review.mjs?v=lobby-dialogs-1';

const charactersLink=document.getElementById('charactersLink');
const charactersDialog=document.getElementById('charactersDialog');
const cards=charactersDialog.querySelector('.portrait-cards');
const portraitDialog=document.getElementById('portraitDialog');
const portrait=portraitDialog.querySelector('.full-portrait');
const portraitTitle=document.getElementById('portraitTitle');
const helpDialog=document.getElementById('helpDialog');
const helpContent=helpDialog.querySelector('.lobby-help');
const helpStatus=document.getElementById('helpStatus');
let helpLoading=false;

function openDialog(link,dialog,onOpen){
  link.addEventListener('click',event=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(dialog.open)return;
    dialog.showModal();
    dialog.scrollTop=0;
    onOpen();
  });
}

openDialog(charactersLink,charactersDialog,()=>{
  if(cards.childElementCount)return;
  renderCharacterCards(cards,character=>{
    portraitTitle.textContent=character.name+' · 完整立绘';
    portrait.alt=character.name+' 的完整立绘';
    portrait.src=character.imageUrl;
    portraitDialog.showModal();
  });
});

for(const link of document.querySelectorAll('[data-open-help]')){
  openDialog(link,helpDialog,async ()=>{
    if(helpLoading||!helpStatus.isConnected)return;
    helpLoading=true;
    helpStatus.textContent='正在加载说明…';
    try{
      const response=await fetch(new URL('./help.html',import.meta.url));
      if(!response.ok)throw new Error('Help page unavailable');
      const page=new DOMParser().parseFromString(await response.text(),'text/html');
      const sections=page.querySelectorAll('main > section');
      if(!sections.length)throw new Error('Help page has no sections');
      helpContent.replaceChildren(...sections);
    }catch{
      helpStatus.textContent='说明加载失败，请关闭弹窗后重新打开。';
    }finally{
      helpLoading=false;
    }
  });
}
