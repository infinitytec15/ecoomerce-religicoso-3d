/* Local prototype features: devotional feedback, prayer signup, mural, 3D. */
const devotionalVerses=[
  {text:'Façam tudo com amor.',reference:'1 Coríntios 16:14',search:'1 Coríntios 16:14'},
  {text:'Deus é o nosso refúgio e a nossa fortaleza.',reference:'Salmos 46:1 · trecho',search:'Salmos 46:1'},
  {text:'Lancem sobre ele toda a sua ansiedade…',reference:'1 Pedro 5:7 · trecho',search:'1 Pedro 5:7'}
];
let verseIndex=0,verseTimer,verseScheduled,lastVerseAt=0,lastFaithRoute=null,arrivalAnimations=[],keyboardNavAt=0,viewerControl=null,viewerLoadToken=0,newsletterTimer;
let prayerPosts=readStore('prayers',[]),prayedFor=readStore('prayed',[]),hiddenPrayers=readStore('hidden-prayers',[]),prayerFilter='Todos';
let prayerDraft={name:'',title:'',message:'',category:'Família',anonymous:true,consent:false};
const prayerExamples=[
  {id:'example-family',name:'Exemplo de família',title:'Pela paz em nosso lar',message:'Peço oração para que haja mais diálogo, paciência e união em nossa família. Que o amor de Deus guie nossos passos.',category:'Família',example:true},
  {id:'example-gratitude',name:'Exemplo de gratidão',title:'Gratidão pelos pequenos recomeços',message:'Hoje minha oração é de agradecimento. Pela vida, pelas pessoas que caminham comigo e pela esperança de recomeçar.',category:'Gratidão',example:true},
  {id:'example-direction',name:'Exemplo de pedido',title:'Sabedoria para uma nova etapa',message:'Peço oração por clareza e serenidade nas decisões desta fase. Que eu saiba ouvir, ter coragem e seguir com fé.',category:'Direção',example:true}
];
paths.book='M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V5ZM5 8h3m-3 4h3m8-4h3m-3 4h3';
paths.rotate='M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 12-2L20 8M4 16l2.5 3a7 7 0 0 0 12-2';
paths.expand='M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5';
paths.mail='M3 5h18v14H3V5Zm0 0 9 8 9-8';
function verseUrl(v){return 'https://www.biblegateway.com/passage/?search='+encodeURIComponent(v.search)+'&version=NVI-PT'}
function setupFeatureSurfaces(){
  if($('#verse-toast'))return;
  document.body.insertAdjacentHTML('beforeend',`<aside id="verse-toast" class="verse-toast" aria-label="Versículo para o seu dia" aria-live="polite" aria-atomic="true" aria-hidden="true" inert><span class="verse-toast-icon">${icon('book')}</span><div class="verse-toast-content"></div><button class="icon-btn verse-dismiss" data-action="dismiss-verse" aria-label="Fechar versículo">${icon('close')}</button></aside><button class="devotion-trigger" data-action="show-verse" aria-label="Mostrar um versículo bíblico" title="Uma palavra para o seu dia">${icon('book')}</button><div id="bible-arrival" class="bible-arrival" aria-hidden="true"><span class="arrival-book"><i class="arrival-page arrival-left"></i><i class="arrival-page arrival-right"></i><i class="arrival-spine"></i></span></div>`);
  const node=$('#verse-toast');
  node.addEventListener('mouseenter',()=>clearTimeout(verseTimer));
  node.addEventListener('mouseleave',scheduleVerseDismiss);
  node.addEventListener('focusin',()=>clearTimeout(verseTimer));
  node.addEventListener('focusout',()=>setTimeout(()=>{if(!node.contains(document.activeElement))scheduleVerseDismiss()},0));
}
function hideVerse(){const n=$('#verse-toast');if(n){n.classList.remove('visible');n.inert=true;n.setAttribute('aria-hidden','true')}clearTimeout(verseTimer)}
function scheduleVerseDismiss(){clearTimeout(verseTimer);verseTimer=setTimeout(hideVerse,10000)}
function showVerse(manual=false){
  setupFeatureSurfaces();
  if($('#overlay-root').children.length&&!manual)return;
  if(!manual&&Date.now()-lastVerseAt<30000)return;
  const v=devotionalVerses[verseIndex++%devotionalVerses.length];lastVerseAt=Date.now();
  $('.verse-toast-content').innerHTML=`<p>“${esc(v.text)}”</p><a href="${verseUrl(v)}" target="_blank" rel="noopener noreferrer">${esc(v.reference)} · NVI ${icon('arrow')}</a><button class="verse-next" data-action="show-verse">Outro versículo</button>`;
  $('#verse-toast').inert=false;$('#verse-toast').setAttribute('aria-hidden','false');$('#verse-toast').classList.add('visible');scheduleVerseDismiss();
}
function animateBibleArrival(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||Date.now()-keyboardNavAt<1000)return;
  arrivalAnimations.forEach(a=>a.cancel());
  const el=$('#bible-arrival'),curve='cubic-bezier(.23,1,.32,1)';
  arrivalAnimations=[el.animate([{opacity:0,transform:'translate(-50%,8px) scale(.95)'},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.32},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.7},{opacity:0,transform:'translate(-50%,-5px) scale(1)'}],{duration:280,easing:curve}),$('.arrival-left',el).animate([{transform:'perspective(250px) rotateY(65deg)'},{transform:'perspective(250px) rotateY(-12deg)'}],{duration:220,easing:curve}),$('.arrival-right',el).animate([{transform:'perspective(250px) rotateY(-65deg)'},{transform:'perspective(250px) rotateY(12deg)'}],{duration:220,easing:curve})];
}
function refreshFaithFeatures(){
  setupFeatureSurfaces();
  const route=location.hash||'#/';if(route.startsWith('#/admin')||document.body.classList.contains('auth-mode')){clearTimeout(verseScheduled);clearTimeout(newsletterTimer);hideVerse();arrivalAnimations.forEach(a=>a.cancel());return}
  const welcome=$('.announcement .container>span:first-child');if(welcome&&!$('.announcement-prayer',welcome))welcome.innerHTML=`Fé para viver. <button class="announcement-prayer" data-action="newsletter">Receba uma oração diária grátis ${icon('mail')}</button>`;
  const nav=$('.nav-links');if(nav&&!$('.community-link',nav))nav.insertAdjacentHTML('beforeend',`<a class="community-link" href="#/cantinho-da-fe">${icon('heart')}Cantinho da Fé</a>`);
  const footerBrand=$('.footer-grid>div:first-child');if(footerBrand&&!$('.prayer-invite',footerBrand))footerBrand.insertAdjacentHTML('beforeend',`<button class="prayer-invite" data-action="newsletter">${icon('mail')}Receber uma oração diária ${icon('arrow')}</button>`);
  const gallery=$('.gallery-main');if(gallery&&!$('.open-3d',gallery)){const id=decodeURIComponent(route).split('/')[2];gallery.insertAdjacentHTML('beforeend',`<button class="open-3d" data-action="open-3d" data-id="${esc(id)}">${icon('box')}Ver peça em 3D ${icon('rotate')}</button>`)}
  if(route!==lastFaithRoute){lastFaithRoute=route;animateBibleArrival();clearTimeout(verseScheduled);if(!route.startsWith('#/checkout')&&!route.startsWith('#/sucesso')&&!route.startsWith('#/clube/assinar')&&!route.startsWith('#/clube/confirmacao'))verseScheduled=setTimeout(()=>showVerse(false),900);else hideVerse()}
  clearTimeout(newsletterTimer);
  const subscription=readStore('newsletter',null),snooze=readStore('newsletter-snooze',0);
  if(!subscription?.subscribed&&Date.now()>snooze&&!sessionStorage.getItem('amago-newsletter-shown'))newsletterTimer=setTimeout(()=>{
    if($('#overlay-root').children.length||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)||location.hash.startsWith('#/checkout')||location.hash.startsWith('#/cantinho')||location.hash.startsWith('#/admin')||location.hash.startsWith('#/clube/assinar')||location.hash.startsWith('#/clube/confirmacao'))return;
    sessionStorage.setItem('amago-newsletter-shown','1');openNewsletter();
  },12000);
}
function openFeatureDialog(html,cls,label){
  const trigger=document.activeElement;if($('#overlay-root').children.length)closeOverlay();lastFocus=trigger;
  $('#overlay-root').innerHTML=`<div class="overlay feature-overlay" data-action="backdrop"><section class="feature-dialog ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</section></div>`;
  document.body.style.overflow='hidden';hideVerse();
  requestAnimationFrame(()=>$('.feature-dialog [data-action=close]')?.focus());
}
function openNewsletter(){
  sessionStorage.setItem('amago-newsletter-shown','1');
  const existing=readStore('newsletter',null);
  openFeatureDialog(`<button class="icon-btn dialog-close" data-action="close" data-snooze="true" aria-label="Fechar convite de oração diária">${icon('close')}</button><div class="prayer-popup-story">${icon('book')}<h2>Uma pausa. <br>Uma oração. <br><em>Um novo dia.</em></h2><p>“Senhor, guia meus passos hoje. Que eu encontre paz para seguir e amor para compartilhar. Amém.”</p><small>Oração de acolhimento · texto autoral</small></div><div class="prayer-popup-form"><h2>Comece o dia<br>com o coração em Deus.</h2><p>Receba uma oração diária por e-mail, gratuitamente. Um momento de fé para acompanhar sua manhã.</p><span class="badge olive">Grátis · sem compromisso</span><div class="notice" style="margin-block:20px">Inscrição demonstrativa. Nesta versão local, nenhum e-mail é enviado.</div><form id="prayer-subscribe-form" class="stack"><label>Seu primeiro nome <span class="muted">(opcional)</span><input name="name" maxlength="40" placeholder="Como podemos chamar você?" autocomplete="off" value="${esc(existing?.name||'')}"></label><label>E-mail de demonstração<input name="email" type="email" required placeholder="voce@exemplo.com" autocomplete="off" value="${esc(existing?.email||'')}"></label><label class="check-line"><input name="consent" type="checkbox" required>Quero participar da demonstração de oração diária.</label><button class="btn full">Quero receber minha oração ${icon('heart')}</button></form><button class="text-btn" data-action="snooze-newsletter">Agora não, obrigada(o)</button>${existing?.subscribed?`<button class="text-btn" data-action="unsubscribe-prayer">Cancelar inscrição de demonstração</button>`:''}</div>`,'prayer-popup','Receber oração diária por e-mail');
}
function prayerCard(p){const prayed=prayedFor.includes(p.id);return `<article class="prayer-card"><h3>${esc(p.title)}</h3><div class="row between"><span class="prayer-category">${icon(p.category==='Gratidão'?'spark':'heart')}${esc(p.category)}</span><span class="prayer-card-date">${p.example?'Exemplo ilustrativo':new Date(p.created).toLocaleDateString('pt-BR')}</span></div><p>${esc(p.message)}</p><div class="prayer-author">${icon('user')} ${esc(p.anonymous?'Pedido anônimo':p.name||'Alguém em oração')}</div><div class="prayer-card-actions"><button class="praying-button ${prayed?'active':''}" data-action="pray-for" data-id="${esc(p.id)}" aria-pressed="${prayed}">${icon('heart')}${prayed?'Estou orando por você':'Vou orar por você'}<span>${prayed?'1':'0'}</span></button><button class="text-btn" data-action="${p.example?'hide-prayer':'delete-prayer'}" data-id="${esc(p.id)}">${p.example?'Ocultar exemplo':'Remover meu pedido'}</button></div></article>`}
function communityPage(){const all=[...prayerPosts,...prayerExamples].filter(p=>!hiddenPrayers.includes(p.id)),list=all.filter(p=>prayerFilter==='Todos'||p.category===prayerFilter);return `<main id="main" class="container community-page">${crumb([{label:'Cantinho da Fé'}])}<section class="community-hero"><div><h1>Ninguém precisa<br><em>caminhar sozinho.</em></h1><p>Um cantinho para deixar sua oração, compartilhar gratidão e acolher a caminhada de alguém. Aqui, a fé também é encontro.</p><div class="row wrap"><button class="btn" data-action="focus-prayer">Quero pedir uma oração ${icon('heart')}</button><button class="text-btn" data-action="newsletter">Receber oração diária grátis ${icon('mail')}</button></div></div><div class="community-hero-note">${icon('heart')}<p>Seu pedido importa.<br>Sua oração pode acolher alguém.</p><span>Mural de demonstração</span></div></section><div class="notice community-demo">Este é o protótipo de um mural público. Os pedidos e as interações ficam apenas neste navegador e não são publicados na internet.</div><div class="community-layout"><section class="prayer-wall" aria-label="Mural de pedidos de oração"><div class="section-header"><div><h2>Vamos orar uns pelos outros.</h2><p>${list.length} ${list.length===1?'pedido neste cantinho':'pedidos neste cantinho'} · exemplos identificados</p></div></div><div class="prayer-filters" role="group" aria-label="Filtrar pedidos">${['Todos','Família','Saúde','Gratidão','Direção','Fé'].map(c=>`<button class="chip ${prayerFilter===c?'active':''}" data-action="prayer-filter" data-filter="${c}" aria-pressed="${prayerFilter===c}">${c}</button>`).join('')}</div><div class="prayer-posts">${list.length?list.map(prayerCard).join(''):`<div class="empty">${icon('heart')}<h3>Este espaço está aberto para acolher.</h3><p>Ainda não há pedidos nesta categoria. Você pode compartilhar o primeiro.</p><button class="btn secondary" data-action="focus-prayer">Escrever meu pedido</button></div>`}</div></section><aside class="prayer-compose" id="prayer-compose"><h2>O que está no seu coração?</h2><p>Escreva seu pedido com carinho. Evite nomes completos, contatos ou dados pessoais de outras pessoas.</p><form id="prayer-request-form" class="stack"><label>Seu primeiro nome <span class="muted">(opcional)</span><input id="prayer-name" name="name" maxlength="40" value="${esc(prayerDraft.name)}" placeholder="Seu nome de demonstração"></label><label class="check-line"><input name="anonymous" type="checkbox" ${prayerDraft.anonymous?'checked':''}>Publicar como pedido anônimo</label><label>Como podemos orar?<input name="title" required minlength="5" maxlength="80" value="${esc(prayerDraft.title)}" placeholder="Ex.: Pela paz na minha família"></label><label>Categoria<select name="category">${['Família','Saúde','Gratidão','Direção','Fé'].map(c=>`<option ${prayerDraft.category===c?'selected':''}>${c}</option>`).join('')}</select></label><label>Seu pedido<textarea name="message" aria-label="Seu pedido" aria-describedby="prayer-char-count" required minlength="12" maxlength="500" placeholder="Compartilhe o que gostaria de colocar em oração.">${esc(prayerDraft.message)}</textarea><small class="muted" id="prayer-char-count">${prayerDraft.message.length}/500 caracteres</small></label><label class="check-line"><input name="consent" type="checkbox" required ${prayerDraft.consent?'checked':''}>Entendo que meu pedido aparecerá no mural desta demonstração.</label><button class="btn full">Publicar pedido de oração ${icon('heart')}</button></form><small class="prayer-privacy">Você pode remover seu pedido a qualquer momento neste navegador.</small></aside></div><section class="daily-prayer-banner"><div>${icon('book')}<h2>Um pouquinho de fé,<br><em>todos os dias.</em></h2><p>Conheça o convite para receber uma oração diária por e-mail.</p></div><button class="btn light" data-action="newsletter">Quero receber gratuitamente ${icon('arrow')}</button></section></main>`}
let viewerModulePromise;
function load3DModule(){
  if(window.Amago3D)return Promise.resolve(window.Amago3D);
  if(viewerModulePromise)return viewerModulePromise;
  viewerModulePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='viewer-3d-bundle.js?v=f4051d7b04';script.onload=()=>resolve(window.Amago3D);script.onerror=()=>{viewerModulePromise=null;script.remove();reject(Error('Não foi possível carregar o visualizador local'))};document.head.append(script)});
  return viewerModulePromise;
}
async function open3D(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  openFeatureDialog(`<div class="viewer-header"><div><h2>${esc(p.name)}</h2><p>Explore sua peça em 3D.</p></div><button class="icon-btn" data-action="close" aria-label="Fechar visualização 3D">${icon('close')}</button></div><div class="viewer-stage" id="viewer-stage"><div class="viewer-loading">${icon('box')}Preparando sua peça em 3D…</div></div><div class="viewer-toolbar"><span>Arraste para girar · role ou use dois dedos para aproximar</span><div class="row"><button class="icon-btn" data-action="3d-left" aria-label="Girar peça para a esquerda">${icon('chevron')}</button><button class="icon-btn" data-action="3d-right" aria-label="Girar peça para a direita">${icon('chevron')}</button><button class="icon-btn" data-action="3d-in" aria-label="Aproximar peça">${icon('plus')}</button><button class="icon-btn" data-action="3d-out" aria-label="Afastar peça">${icon('minus')}</button><button class="icon-btn" data-action="3d-reset" aria-label="Restaurar posição da peça">${icon('rotate')}</button><button class="btn secondary small" data-action="3d-auto" aria-pressed="false">Girar sozinho</button></div></div><div class="viewer-finishes"><span>Cor da peça</span><div class="color-buttons">${p.colors.map(c=>`<button class="color-button ${c===(detail.color||p.colors[0])?'selected':''}" data-action="3d-color" data-color="${c}" aria-pressed="${c===(detail.color||p.colors[0])}"><i style="background:${colorHex(c)}"></i>${c}</button>`).join('')}</div></div><div class="viewer-disclosure">Modelo 3D ilustrativo criado para o protótipo. Formas e proporções não representam um arquivo de fabricação.</div>`,'product-viewer','Visualização tridimensional de '+p.name);
  const token=++viewerLoadToken;$$('.viewer-toolbar button').forEach(b=>b.disabled=true);
  try{const module=await load3DModule();if(token!==viewerLoadToken||!$('#viewer-stage'))return;viewerControl=await module.createViewer($('#viewer-stage'),p,colorHex(detail.color||p.colors[0]));if(token!==viewerLoadToken){viewerControl?.dispose();viewerControl=null}else $$('.viewer-toolbar button').forEach(b=>b.disabled=false)}
  catch(err){console.warn('Visualização 3D:',err.message);if(token===viewerLoadToken&&$('#viewer-stage'))$('#viewer-stage').innerHTML=`<div class="viewer-loading">${icon('box')}Não foi possível abrir o 3D neste navegador.<small>Continue pelas fotos ou tente novamente.</small><button class="btn secondary" data-action="open-3d" data-id="${p.id}">Tentar novamente</button></div>`}
}
function disposeFaithViewer(){viewerLoadToken++;viewerControl?.dispose();viewerControl=null}
document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Tab')keyboardNavAt=Date.now()},{capture:true});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action,id=el.dataset.id;
  if(a==='show-verse')showVerse(true);
  if(a==='dismiss-verse')hideVerse()
  if(a==='newsletter')openNewsletter();
  if(a==='snooze-newsletter'||el.dataset.snooze){persist('newsletter-snooze',Date.now()+7*86400000);if(a==='snooze-newsletter')closeOverlay()}
  if(a==='unsubscribe-prayer'){persist('newsletter',null);closeOverlay();toast('Inscrição demonstrativa cancelada.')}
  if(a==='focus-prayer'){$('#prayer-compose').scrollIntoView({block:'center',behavior:'auto'});$('#prayer-name').focus({preventScroll:true})}
  if(a==='prayer-filter'){prayerFilter=el.dataset.filter;render();$(`[data-action="prayer-filter"][data-filter="${prayerFilter}"]`)?.focus({preventScroll:true})}
  if(a==='pray-for'){prayedFor=prayedFor.includes(id)?prayedFor.filter(x=>x!==id):[...prayedFor,id];persist('prayed',prayedFor);render();$(`[data-action="pray-for"][data-id="${id}"]`)?.focus({preventScroll:true});toast(prayedFor.includes(id)?'Seu gesto de oração foi registrado nesta demonstração.':'Gesto de oração removido.')}
  if(a==='hide-prayer'){hiddenPrayers.push(id);persist('hidden-prayers',hiddenPrayers);render();toast('Exemplo ocultado neste navegador.')}
  if(a==='delete-prayer'){prayerPosts=prayerPosts.filter(p=>p.id!==id);prayedFor=prayedFor.filter(x=>x!==id);persist('prayers',prayerPosts);persist('prayed',prayedFor);render();toast('Seu pedido foi removido deste mural de demonstração.')}
  if(a==='open-3d')open3D(id);
  if(a==='3d-left')viewerControl?.rotate(-.3,0);if(a==='3d-right')viewerControl?.rotate(.3,0);
  if(a==='3d-in')viewerControl?.zoom(.85);if(a==='3d-out')viewerControl?.zoom(1.18);if(a==='3d-reset')viewerControl?.reset();
  if(a==='3d-auto'){const on=viewerControl?.toggleAuto()||false;el.setAttribute('aria-pressed',on);el.textContent=on?'Parar rotação':'Girar sozinho'}
  if(a==='3d-color'){detail.color=el.dataset.color;viewerControl?.setColor(colorHex(detail.color));$$('.viewer-finishes .color-button').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',b===el)});const name=$('#color-name');if(name)name.textContent=detail.color;$$('.detail-copy .color-button').forEach(b=>{const on=b.dataset.color===detail.color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on)})}
});
document.addEventListener('submit',e=>{
  const form=e.target;if(form.id!=='prayer-subscribe-form'&&form.id!=='prayer-request-form')return;e.preventDefault();const d=Object.fromEntries(new FormData(form));
  if(form.id==='prayer-subscribe-form'){
    persist('newsletter',{name:d.name.trim(),email:d.email.trim(),subscribed:true,created:Date.now()});persist('newsletter-snooze',Date.now()+30*86400000);
    $('.prayer-popup-form').innerHTML=`<div class="subscription-success">${icon('check')}<h2>Um lugar para a fé no seu dia.</h2><p>Sua inscrição de demonstração foi salva neste navegador.</p><div class="notice">Nenhum e-mail será enviado nesta versão local.</div><button class="btn full" data-action="close">Continuar explorando ${icon('arrow')}</button></div>`;
    $('.subscription-success button').focus();
  }else{
    const post={id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:d.name.trim(),anonymous:d.anonymous==='on',title:d.title.trim(),message:d.message.trim(),category:d.category,created:Date.now()};
    if(post.title.length<5||post.message.length<12){const bad=form.elements[post.title.length<5?'title':'message'];bad.setCustomValidity(post.title.length<5?'Escreva um título com pelo menos 5 caracteres.':'Escreva seu pedido com pelo menos 12 caracteres.');bad.reportValidity();return}
    prayerPosts.unshift(post);persist('prayers',prayerPosts);prayerDraft={name:'',title:'',message:'',category:'Família',anonymous:true,consent:false};prayerFilter='Todos';render();toast('Seu pedido foi acolhido no mural de demonstração.');$('.prayer-posts').scrollIntoView({block:'start',behavior:'auto'});
  }
});
function storePrayerDraft(e){if(e.target.form?.id!=='prayer-request-form')return;const el=e.target;el.setCustomValidity?.('');prayerDraft[el.name]=el.type==='checkbox'?el.checked:el.value;if(el.name==='message'&&$('#prayer-char-count'))$('#prayer-char-count').textContent=el.value.length+'/500 caracteres'}
document.addEventListener('input',storePrayerDraft);document.addEventListener('change',storePrayerDraft);
render();


