(function(){
 const kb = JSON.parse(document.getElementById('kb').textContent);
 const API = "/*API*/";   // URL do backend (Google Apps Script). Vazio = demonstração local, sem servidor.
 const M = new Proxy(kb.mensagens,{get:(o,k)=>Array.isArray(o[k])?o[k][Math.floor(Math.random()*o[k].length)]:o[k]}), CFG = kb.config, META = (CFG.indicacao||{}).meta||5;
 const $ = id => document.getElementById(id);
 const log=$('log'), f=$('f'), inp=$('t'), cta=$('cta'), ctaLink=$('ctaLink'), chips=$('chips'), pg=$('pg'), altLink=$('altLink'), faixa=$('faixa');
 const guardar=(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} }, ler=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
 const qs = new URLSearchParams(location.search), origem = {dispositivo: matchMedia('(max-width:1020px)').matches ? 'mobile':'desktop'};
 for (const k of ['utm_source','utm_medium','utm_campaign','utm_content']) if (qs.get(k)) origem[k] = qs.get(k).slice(0,80);
 const tokenConvite = (/^[0-9a-f]{12}$/.test(qs.get('i')||'') ? qs.get('i') : '');
 let conv = novaConversa(), busy=false, sample=null, sampleTried=false, slotsServidor=null, aberto=false;
 let sessao = ler('lp_sessao')||'', reservaId='', estado=null, codigoAtivo=null, cartaoInd=null;
 const espera = ms => new Promise(z=>setTimeout(z,ms));
 // medição própria (backend 1.5.0): só canal, formato, etapa e variante; nunca nome, e-mail ou telefone
 const variante=(()=>{ let v=ler('lp_ab1'); if(v!=='A'&&v!=='B'){ v=Math.random()<0.5?'A':'B'; guardar('lp_ab1',v); } return 'abertura_'+v; })();
 origem.variante=variante;
 const sid=(Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/[^a-z0-9]/g,'').slice(0,24), ENVIA={visita:1,estado:1,chat_aberto:1,cta:1,whatsapp:1,email_confirmado:1,indicacao:1,pre_reserva:1};
 let ultimoEstado='';
 function beacon(tipo,meta){ if(!API||!ENVIA[tipo]) return; const est=(meta&&meta.estado)||''; if(tipo==='estado'){ if(est===ultimoEstado) return; ultimoEstado=est; }
  try{ const b=JSON.stringify({acao:'evento',s:sid,tipo,estado:est,canal:origem.utm_source||'direto',formato:origem.utm_medium||'',conteudo:origem.utm_content||'',campanha:origem.utm_campaign||'',variante,dispositivo:origem.dispositivo});
   if(!(navigator.sendBeacon&&navigator.sendBeacon(API,new Blob([b],{type:'text/plain;charset=utf-8'})))) fetch(API,{method:'POST',mode:'no-cors',keepalive:true,headers:{'Content-Type':'text/plain;charset=utf-8'},body:b}).catch(()=>{}); }catch(e){} }
 // treino diário (backend 1.6.0): só o texto da pergunta que o chat não soube, sem telefone, e-mail ou CPF
 const semDados=t=>String(t||'').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'(e-mail)').replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g,'(cpf)').replace(/(\+?\d[\d ()\-.]{6,}\d)/g,'(número)').slice(0,280);
 function aprender(a,est){ if(!API||!a||!a.texto) return; try{ const b=JSON.stringify({acao:'pergunta',s:sid,modo:a.modo,texto:semDados(a.texto),intent:a.intent||'',estado:est||'',canal:origem.utm_source||'direto',variante});
   if(!(navigator.sendBeacon&&navigator.sendBeacon(API,new Blob([b],{type:'text/plain;charset=utf-8'})))) fetch(API,{method:'POST',mode:'no-cors',keepalive:true,headers:{'Content-Type':'text/plain;charset=utf-8'},body:b}).catch(()=>{}); }catch(e){} }
 const track=(tipo,meta)=>{ try{ (window.dataLayer=window.dataLayer||[]).push(Object.assign({event:'lp_'+tipo},origem,meta||{})); }catch(e){} beacon(tipo,meta); };
 const fill=(t,o)=>String(t||'').replace(/\{(\w+)\}/g,(m,k)=>o[k]!=null?o[k]:m);
 const prim=n=>String(n||'').trim().split(/\s+/)[0]||'';

 // ---------------------------------------------------------------- API (Apps Script: POST text/plain evita preflight de CORS)
 async function api(acao, dados={}, repetir=0){
  if(!API) return demo(acao, dados);
  for(let i=0;i<=repetir;i++){
   try{ const c=new AbortController(), to=setTimeout(()=>c.abort(),30000);
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({acao},dados)),signal:c.signal});
    clearTimeout(to); return await r.json(); }
   catch(e){ if(i===repetir) return {ok:false,erro:'rede'}; await espera(900); } } }

 // ---------------------------------------------------------------- demonstração local (artefato): mesmo contrato do backend
 const D={pessoas:{},inds:[],res:{}};
 function demoEstado(p){ const inds=D.inds.filter(i=>i.dono===p.id), v=inds.filter(i=>i.status==='validado').length, lib=v>=META;
  return {ok:true,validado:!!p.ok,primeiro_nome:prim(p.nome),meta:META,max:10,validas:v,
   indicacoes:inds.map(i=>({id:i.id,primeiro_nome:prim(i.nome),status:i.status,whatsapp:i.whatsapp,link:location.href.split('?')[0]+'?i='+i.token})),
   materiais:p.ok?[...CFG.biblioteca.map(b=>({tipo:'ebook',titulo:b.titulo+' (e-book)',url:'#demo'})),...(CFG.guias||[]).map((g,n)=>({tipo:'guia',titulo:'Guia '+(n+1)+' · '+g.titulo,url:'#demo'}))]:[],
   aulas_liberadas:lib,aulas:(CFG.aulas||[]).map((t,n)=>({id:'a'+n,titulo:'Aula '+(n+1)+' · '+t,url:''}))}; }
 async function demo(acao,b){ await espera(500); const s=D.pessoas[b.sessao];
  if(acao==='horarios') return {ok:false};
  if(acao==='iniciar'||acao==='aceitar'){ const tk='demo'+Math.random().toString(16).slice(2); D.pessoas[tk]={id:tk,nome:b.nome||'Convidada Demo',ok:false};
   setTimeout(()=>add('n','Demonstração: nesta prévia não há envio de e-mail. Use o código 123456.'),700); return {ok:true,sessao:tk,email_mascara:'v•••@e•••.com'}; }
  if(acao==='reenviar') return {ok:true};
  if(acao==='validar'){ if(!s) return {ok:false,erro:'sessao'}; if(b.codigo!=='123456') return {ok:false,erro:'codigo',restantes:4}; s.ok=true; return demoEstado(s); }
  if(acao==='status'||acao==='perfil') return s?demoEstado(s):{ok:false,erro:'sessao'};
  if(acao==='indicar'){ if(!s) return {ok:false,erro:'sessao'}; const i={id:'i'+D.inds.length,dono:s.id,nome:b.nome,whatsapp:b.whatsapp,status:'enviado',token:Math.random().toString(16).slice(2,14)}; D.inds.push(i);
   setTimeout(()=>{ i.status='validado'; },4000); return {ok:true,estado:demoEstado(s)}; }
  if(acao==='convite') return {ok:true,primeiro_nome:'Visitante',indicador:'Ana',email_mascara:'v•••@e•••.com'};
  if(acao==='recusar') return {ok:true};
  if(acao==='reservar') return {ok:true,slot_ok:true,reserva:'demo'+Date.now().toString(16)};
  if(acao==='termo') return {ok:true,termo_ok:true};
  return {ok:false,erro:'acao'}; }

 const ERRO={codigo:'Esse código não confere. Pode conferir e digitar de novo, por favor?',expirado:'Esse código já expirou. É só tocar em "Reenviar código" que eu envio outro.',tentativas:'Foram várias tentativas. Por segurança, toque em "Reenviar código" para receber um novo.',
  limite:'Recebi muitos pedidos em pouco tempo. Pode tentar de novo em alguns minutos, ou falar com a equipe no WhatsApp, por favor.',rede:'Não consegui conectar agora, peço desculpas. Pode conferir a internet e tentar de novo?',
  sessao:'Sua sessão expirou. Pode recarregar a página e confirmar o e-mail de novo, por favor?',nome:'Pode escrever nome e sobrenome, por favor?',whatsapp:'Pode conferir o WhatsApp com DDD, por favor?',email:'Pode conferir o e-mail, por favor?',
  proprio:'A indicação é para outra pessoa: o seu próprio contato não entra na lista.',repetido:'Essa pessoa já está na sua lista.',maximo:'Você chegou ao limite de 10 indicações. Obrigada por compartilhar.',cpf:'Pode conferir o CPF, por favor?',aceite:'Para concluir, é só marcar a caixa de aceite.',
  consentimento:'Para continuar, preciso da sua concordância com o uso dos dados.',convite:'Este convite não está mais disponível.',nascimento:'Pode conferir a data de nascimento, por favor?',ocupado:'O sistema está com muitos acessos agora. Pode tentar de novo em instantes, por favor?'};
 const msgErro=r=>(ERRO[r&&r.erro]||'Algo não saiu como esperado, peço desculpas. Pode tentar de novo?')+(r&&r.restantes!=null?' Restam '+r.restantes+' tentativas.':'');

 // ---------------------------------------------------------------- utilidades de interface
 function add(role,text){ const d=document.createElement('div'); d.className='m '+role; d.textContent=text; log.append(d); log.scrollTop=log.scrollHeight; return d; }
 function el(tag,attrs,...kids){ const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs||{})) if(v!=null&&v!==false) (k==='text')?e.textContent=v:e.setAttribute(k,v===true?'':v); for(const c of kids) if(c) e.append(c); return e; }
 function cartao(titulo,cls){ const c=el('div',{class:'cc'+(cls?' '+cls:'')}); c.append(el('h4',{text:titulo})); log.append(c); requestAnimationFrame(()=>c.scrollIntoView({block:'nearest',behavior:'smooth'})); return c; }
 const linha=(txt)=>el('p',{class:'erro',role:'alert',text:txt||''});
 async function copiar(txt,btn,rot){ try{ await navigator.clipboard.writeText(txt); }catch(e){ const t=el('textarea',{}); t.value=txt; document.body.append(t); t.select(); try{ document.execCommand('copy'); }catch(x){} t.remove(); } const o=btn.textContent; btn.textContent=rot||'Copiado'; setTimeout(()=>btn.textContent=o,1800); }
 function ocupado(btn,txt){ const o=btn.textContent; btn.disabled=true; btn.textContent=txt; return ()=>{ btn.disabled=false; btn.textContent=o; }; }
 const waLink=(num,txt)=>'https://wa.me/'+num+'?text='+encodeURIComponent(txt);

 // ---------------------------------------------------------------- código por e-mail
 function cartaoCodigo(mascara,aoValidar){
  const c=cartao('Confirme o seu e-mail','cod');
  c.append(el('p',{text:'Enviamos um código de 6 dígitos para '+mascara+'. Ele vale por 10 minutos.'}));
  const fm=el('form',{class:'linha'}), cx=el('input',{inputmode:'numeric',autocomplete:'one-time-code',maxlength:'6',pattern:'[0-9]{6}','aria-label':'Código de 6 dígitos',placeholder:'000000'}), ok=el('button',{type:'submit',class:'pri',text:'Confirmar'});
  fm.append(cx,ok); const er=linha(), re=el('button',{type:'button',class:'lnk',text:'Reenviar código'}), dica=el('small',{text:' Não chegou? Olhe o spam ou a aba Promoções.'});
  c.append(fm,er,el('div',{class:'rodape'},re,dica));
  let espe=30; re.disabled=true; const tic=setInterval(()=>{ espe--; re.textContent=espe>0?'Reenviar em '+espe+' s':'Reenviar código'; if(espe<=0){ re.disabled=false; clearInterval(tic); } },1000);
  async function enviarCod(v){ v=String(v||cx.value).replace(/\D/g,''); if(v.length!==6){ er.textContent='Digite os 6 dígitos.'; return; }
   cx.value=v; const volta=ocupado(ok,'Confirmando…'); er.textContent='';
   const r=await api('validar',{sessao,codigo:v}); volta();
   if(!r.ok){ er.textContent=msgErro(r); cx.select(); return; }
   codigoAtivo=null; c.classList.add('feito'); fm.remove(); re.parentNode.remove(); er.remove(); c.append(el('p',{class:'okk',text:'E-mail confirmado.'}));
   estado=r; guardar('lp_sessao',sessao); track('email_confirmado'); await aoValidar(r); }
  fm.addEventListener('submit',e=>{ e.preventDefault(); enviarCod(); });
  cx.addEventListener('input',()=>{ cx.value=cx.value.replace(/\D/g,'').slice(0,6); if(cx.value.length===6) enviarCod(); });
  re.onclick=async()=>{ const volta=ocupado(re,'Enviando…'); const r=await api('reenviar',{sessao}); volta(); er.textContent=r.ok?'Enviamos um novo código.':msgErro(r); };
  codigoAtivo={enviar:enviarCod}; setTimeout(()=>cx.focus({preventScroll:true}),300); return c; }

 // ---------------------------------------------------------------- materiais, aulas e indicações
 const capas=[...document.querySelectorAll('.capas img')].map(i=>i.getAttribute('src'));
 function cartaoMateriais(e){ const c=cartao('Seus materiais');
  let n=0; for(const m of e.materiais||[]){ const img=capas[n++];
   c.append(el('a',{class:'doc',href:m.url,target:'_blank',rel:'noopener'},img?el('img',{src:img,alt:''}):el('span',{class:'pdf',text:'PDF'}),el('span',{text:m.titulo}))); }
  c.append(el('small',{text:'Os links também foram para o seu e-mail.'})); }
 function cartaoAulas(e){ const c=cartao(e.aulas_liberadas?'Suas aulas estão liberadas':'As 5 aulas do Dr. Couto',e.aulas_liberadas?'':'trava');
  const ul=el('ul',{class:'aulas'}); for(const a of e.aulas||[]) ul.append(el('li',{},a.url?el('a',{href:a.url,target:'_blank',rel:'noopener',text:a.titulo}):el('span',{text:a.titulo}),
   e.aulas_liberadas&&!a.url?el('small',{text:' · em gravação: o link chega por e-mail'}):null)); c.append(ul);
  if(!e.aulas_liberadas) c.append(el('small',{text:'Liberadas quando '+META+' pessoas indicadas por você confirmarem o e-mail. Faltam '+Math.max(0,META-(e.validas||0))+'.'})); }
 const ROT={enviado:'convite enviado',aberto:'abriu o convite',validado:'confirmou',nao_conta:'já tinha cadastro: não conta',recusado:'preferiu não receber'};
 function cartaoIndicacao(){ if(cartaoInd&&document.body.contains(cartaoInd.c)){ cartaoInd.c.scrollIntoView({block:'nearest',behavior:'smooth'}); return cartaoInd.atualizar(estado); }
  const c=cartao('Indique e libere as 5 aulas','ind');
  const barra=el('div',{class:'barra'},el('i')), info=el('small',{}); c.append(barra,info);
  const fm=el('form',{class:'campos'}), nm=el('input',{placeholder:'Nome e sobrenome',autocomplete:'off','aria-label':'Nome e sobrenome de quem você indica',maxlength:'80'}),
   wa=el('input',{type:'tel',inputmode:'tel',placeholder:'WhatsApp com DDD',autocomplete:'off','aria-label':'WhatsApp de quem você indica'}),
   em=el('input',{type:'email',inputmode:'email',placeholder:'E-mail',autocomplete:'off',autocapitalize:'none','aria-label':'E-mail de quem você indica',maxlength:'120'}),
   ck=el('input',{type:'checkbox',id:'ck-ind'}), lb=el('label',{for:'ck-ind',class:'ck'},ck,el('span',{text:'Esta pessoa concorda em receber o convite.'})), bt=el('button',{type:'submit',class:'pri',text:'Indicar'}), er=linha();
  fm.append(nm,wa,em,lb,bt,er); c.append(fm);
  const lista=el('ul',{class:'lista'}), at=el('button',{type:'button',class:'lnk',text:'Atualizar contagem'}); c.append(lista,el('div',{class:'rodape'},at,el('small',{text:' Contam só pessoas novas que confirmarem o e-mail.'})));
  function atualizar(e){ if(!e) return; estado=e; const v=e.validas||0; barra.firstChild.style.width=Math.min(100,Math.round(v/META*100))+'%';
   info.textContent=v+' de '+META+' pessoas confirmaram'+(e.aulas_liberadas?'. Aulas liberadas!':'.');
   lista.innerHTML=''; for(const i of e.indicacoes||[]){ const li=el('li',{class:i.status},el('b',{text:i.primeiro_nome}),el('span',{class:'st',text:ROT[i.status]||i.status}));
    if(i.status==='enviado'||i.status==='aberto') li.append(el('a',{class:'wa',href:waLink(i.whatsapp,fill(M.convite_mensagem_amigo,{nome:i.primeiro_nome,link:i.link})),target:'_blank',rel:'noopener',text:'Avisar pelo WhatsApp'}));
    lista.append(li); }
   if((e.indicacoes||[]).length>=(e.max||10)){ fm.remove(); }
   if(e.aulas_liberadas&&!conv.aulasMostradas){ conv.aulasMostradas=true; cartaoAulas(e); } }
  fm.addEventListener('submit',async ev=>{ ev.preventDefault(); er.textContent='';
   if(!validarNome(nm.value)) return er.textContent=ERRO.nome; const w=normalizarWhats(wa.value); if(!w) return er.textContent=ERRO.whatsapp; if(!validarEmail(em.value)) return er.textContent=ERRO.email;
   if(!ck.checked) return er.textContent='Indique só quem concordou em receber o convite.';
   const volta=ocupado(bt,'Enviando…'); const r=await api('indicar',{sessao,nome:nm.value.trim(),whatsapp:w,email:em.value.trim(),canal:'landing'}); volta();
   if(!r.ok) return er.textContent=msgErro(r);
   track('indicacao'); nm.value=wa.value=em.value=''; ck.checked=false; atualizar(r.estado); nm.focus({preventScroll:true}); });
  at.onclick=async()=>{ const volta=ocupado(at,'Atualizando…'); const r=await api('status',{sessao},1); volta(); if(r.ok) atualizar(r); };
  cartaoInd={c,atualizar}; atualizar(estado); return c; }

 // ---------------------------------------------------------------- termo, Pix e documentos
 function cpfOk(c){ c=String(c).replace(/\D/g,''); if(c.length!==11||/^(\d)\1+$/.test(c)) return false; for(const n of [9,10]){ let s=0; for(let i=0;i<n;i++) s+=+c[i]*(n+1-i); if(((s*10)%11)%10!==+c[n]) return false; } return true; }
 function cartaoTermo(){ const t=CFG.termo||{clausulas:[]}, e=conv.escolha||{}; const c=cartao('Termo de Atendimento (TCLE)','termo');
  c.append(el('p',{text:'Avaliação presencial com o Dr. José M Couto, '+(e.rotulo||'')+', cerca de '+CFG.avaliacao_minutos+' minutos. Reserva de horário de R$ '+CFG.reserva_valor+',00 via Pix, que não é abatida de um eventual procedimento. Remarcação uma vez, com 24 horas de antecedência; sem aviso ou em caso de falta, a reserva não é devolvida.'}));
  const dt=el('details',{}), sm=el('summary',{text:'Ler o termo completo ('+(t.versao||'')+')'}); dt.append(sm); for(const [tt,x] of t.clausulas) dt.append(el('p',{},el('b',{text:tt+' '}),document.createTextNode(x))); c.append(dt);
  const fm=el('form',{class:'campos'}), cpf=el('input',{inputmode:'numeric',placeholder:'CPF',autocomplete:'off','aria-label':'CPF',maxlength:'14'}),
   ck=el('input',{type:'checkbox',id:'ck-termo'}), lb=el('label',{for:'ck-termo',class:'ck'},ck,el('span',{text:'Li e aceito o Termo de Atendimento (TCLE).'})), bt=el('button',{type:'submit',class:'pri',text:'Aceitar e concluir'}), er=linha();
  cpf.addEventListener('input',()=>{ const d=cpf.value.replace(/\D/g,'').slice(0,11); cpf.value=d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2'); });
  fm.append(cpf,lb,bt,er); c.append(fm,el('small',{text:'Aceite eletrônico: e-mail confirmado por código, data, hora e resumo criptográfico. A cópia em PDF vai para o seu e-mail.'}));
  fm.addEventListener('submit',async ev=>{ ev.preventDefault(); er.textContent='';
   if(!cpfOk(cpf.value)) return er.textContent=ERRO.cpf; if(!ck.checked) return er.textContent=ERRO.aceite;
   const volta=ocupado(bt,'Registrando…'); const r=await api('termo',{sessao,reserva:reservaId,cpf:cpf.value.replace(/\D/g,''),aceite:true}); volta();
   if(!r.ok) return er.textContent=msgErro(r);
   c.classList.add('feito'); fm.remove(); dt.open=false; c.append(el('p',{class:'okk',text:'Termo aceito. A cópia foi para o seu e-mail.'})); track('termo_aceito');
   conv=aposTermo(conv); const d=conv.dados, v={nome:prim(d.nome),slot:e.rotulo||'',reserva:CFG.reserva_valor,prazo:prazoReserva(agoraSP(),e.chave,CFG.hold_horas||12)||'pouco antes do horário'};
   await fala(fill(M.reserva_ok,v)); cartaoPix(); cartaoPreparo(); await fala(fill(M.convite_pitch,{nome:v.nome,meta:META})); render(); }); }
 function crc16(s){ let c=0xFFFF; for(const ch of new TextEncoder().encode(s)){ c^=ch<<8; for(let i=0;i<8;i++) c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF; } return c.toString(16).toUpperCase().padStart(4,'0'); }
 function pixPayload(valor,txid){ const fld=(id,v)=>id+String(v.length).padStart(2,'0')+v, sem=(t,n)=>t.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ]/g,'').toUpperCase().slice(0,n);
  const p=fld('00','01')+fld('26',fld('00','br.gov.bcb.pix')+fld('01',String(CFG.pix_chave_cnpj).replace(/\D/g,'')))+fld('52','0000')+fld('53','986')+fld('54',Number(valor).toFixed(2))+fld('58','BR')+fld('59',sem(CFG.pix_nome||'',25))+fld('60',sem(CFG.pix_cidade||'',15))+fld('62',fld('05',(txid||'***').replace(/[^A-Za-z0-9]/g,'').slice(0,25)||'***'))+'6304';
  return p+crc16(p); }
 function cartaoPix(){ const c=cartao('Reserva de horário · Pix','pix'), d=conv.dados, e=conv.escolha||{}, chave=String(CFG.pix_chave_cnpj).replace(/\D/g,''), chaveFmt=chave.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
  const cod=pixPayload(CFG.reserva_valor,'AVAL'+String(reservaId).replace(/[^a-f0-9]/gi,'').slice(0,8));
  const b1=el('button',{type:'button',text:'Copiar chave'}), b2=el('button',{type:'button',class:'pri',text:'Copiar Pix copia e cola'});
  c.append(el('div',{class:'valor',text:'R$ '+CFG.reserva_valor+',00'}),el('p',{},el('b',{text:'Chave Pix (CNPJ): '}),document.createTextNode(chaveFmt)),el('p',{text:CFG.pix_titular||''}),el('div',{class:'acoes'},b2,b1));
  b1.onclick=()=>copiar(chave,b1,'Chave copiada'); b2.onclick=()=>{ copiar(cod,b2,'Código copiado'); track('pix_copiado'); };
  const txt='Olá! Fiz a pré-reserva pela página para '+(e.rotulo||'')+' ('+(d.nome||'')+'). Segue o comprovante do Pix de R$ '+CFG.reserva_valor+',00.';
  c.append(el('div',{class:'acoes'},el('a',{class:'wa pri',href:waLink(CFG.whatsapp_oficial,txt),target:'_blank',rel:'noopener',text:'Enviar comprovante pelo WhatsApp'})));
  c.append(el('small',{text:'O Instituto não envia link de pagamento. O horário é confirmado quando o pagamento é identificado na conta do Instituto.'})); }
 function cartaoPreparo(){ const c=cartao('Para o dia da avaliação'); const p=(CFG.documentos||[]).find(x=>x.id==='preparo');
  if(p) c.append(el('a',{class:'doc',href:p.arquivo,target:'_blank',rel:'noopener'},el('span',{class:'pdf',text:'PDF'}),el('span',{text:p.titulo}))); }

 // ---------------------------------------------------------------- fluxos com o backend
 async function fala(t){ await digitando(t); add('a',t); }
 function falhou(){ add('a',M.reserva_falhou); atualizarLinks(); cta.style.display='block'; }
 async function iniciarConteudo(){ const d=conv.dados;
  const r=await api('iniciar',{tipo:'conteudo',consent:true,nome:d.nome,whatsapp:d.whatsapp,email:d.email,origem,site:''});
  if(!r.ok){ add('a',msgErro(r)); if(r.erro==='rede'||r.erro==='limite'){ atualizarLinks(); cta.style.display='block'; } conv.estado='inicio'; return; }
  sessao=r.sessao; cartaoCodigo(r.email_mascara,async e=>{ conv=aposValidar(conv); guardar('lp_nome',prim(d.nome));
   await fala(fill(M.conteudo_liberado,{nome:prim(d.nome)})); cartaoMateriais(e); cartaoIndicacao(); cartaoAulas(e); await fala(M.pos_conteudo); render(); ajustarEntrada(); }); }
 async function iniciarAgendamento(){ const d=conv.dados;
  if(d.validado&&sessao){ const p=await api('perfil',{sessao,nome:d.nome,nascimento:d.nascimento,cidade:d.cidade||'',como_conheceu:d.como_conheceu||''});
   if(p.ok){ estado=p; conv=aposValidar(conv); return reservarPasso(); } if(p.erro!=='sessao') return falhou(); sessao=''; }
  const r=await api('iniciar',{tipo:'agendamento',consent:true,nome:d.nome,whatsapp:d.whatsapp,email:d.email,nascimento:d.nascimento,cidade:d.cidade||'',como_conheceu:d.como_conheceu||'',origem,site:''});
  if(!r.ok){ if(r.erro==='rede'||r.erro==='limite'||r.erro==='ocupado') return falhou(); add('a',msgErro(r)); return falhou(); }
  sessao=r.sessao; cartaoCodigo(r.email_mascara,async()=>{ conv=aposValidar(conv); guardar('lp_nome',prim(d.nome)); await reservarPasso(); }); }
 async function reservarPasso(){ const d=conv.dados, e=conv.escolha||{};
  const st=add('n','Segurando o horário…');
  const r=await api('reservar',{sessao,slot_inicio:e.chave,slot_rotulo:e.rotulo,regiao:d.regiao||'',objetivo:d.objetivo||'',dor:d.dor||'',tempo:d.tempo||'',tentativas:d.tentativas||'',prazo:d.prazo||''}); st.remove();
  if(!r.ok) return falhou();
  if(r.slot_ok===false){ const s=(r.slots||[]).slice(0,2); if(s.length<2) return falhou();
   conv.slots=s; conv.estado='horarios'; conv.escolha=null; await fala(fill(M.oferecer_horarios,{slot1:s[0].rotulo,slot2:s[1].rotulo}).replace(/^/, 'Esse horário acabou de ser preenchido, peço desculpas. ')); render(); return; }
  reservaId=r.reserva; track('pre_reserva'); await fala(M.horario_segurado); cartaoTermo(); render(); }

 // ---------------------------------------------------------------- horários (agenda real via backend; sem resposta => regra local)
 let slotsPromessa=null;
 function carregarSlots(){ if(!API) return Promise.resolve(); if(!slotsPromessa) slotsPromessa=api('horarios',{},1).then(j=>{ if(j&&Array.isArray(j.slots)&&j.slots.length>=2) slotsServidor=j.slots; }); return slotsPromessa; }
 const comPrazo=(p,ms)=>Promise.race([p,espera(ms)]);

 // ---------------------------------------------------------------- L1 (modelo leve): no artefato, o 'sample' do visitante; publicado, desligado (custo zero)
 async function l1(texto,c,contexto){
  if(API) return null;
  if(!sampleTried){ sampleTried=true; try{ const s=await (window.claude&&window.claude.use?window.claude.use('sample'):null); if(typeof s==='function') sample=s; }catch(e){} }
  if(!sample) return null;
  const pr=promptL1(kb,contexto,c.historico);
  const entrada=pr.system+'\n\nCONTEXTO:\n- '+pr.contexto+'\n\nCONVERSA:\n'+pr.historico.map(h=>(h.r==='u'?'Paciente: ':'Assistente: ')+h.t).join('\n')+'\n\nResponda só com o JSON.';
  const r=await sample(entrada,{modelTier:'quick',cache:false}); const m=/\{[\s\S]*\}/.exec(r.text||''); if(!m) return null;
  const j=JSON.parse(m[0]); return {reply:String(j.reply||''),handoff:!!j.handoff}; }

 function atualizarLinks(){ ctaLink.href=linkWhats(conv,kb,origem.utm_source||''); }
 ctaLink.addEventListener('click',()=>track('whatsapp',{estado:conv.estado}));
 altLink.addEventListener('click',()=>track('whatsapp',{estado:conv.estado,canal:'alt'}));

 function ajustarEntrada(){
  const d=conv.dados, coletando=conv.estado==='dados'||conv.estado==='cadastro', k=coletando?(!d.lgpd?'lgpd':(!d.nome||(conv.coleta!=='conteudo'&&!d.nome_completo))?'nome':(conv.coleta!=='conteudo'&&!d.nascimento)?'nascimento':!d.whatsapp?'whatsapp':!d.email?'email':''):'';
  let ph='Escreva aqui…', type='text', im='text', ac='off', cap='sentences';
  if(k==='lgpd') ph='Responda sim ou não';
  else if(k==='nome'){ ph=conv.coleta==='conteudo'?'Nome e sobrenome':'Nome completo'; ac='name'; cap='words'; }
  else if(k==='nascimento'){ ph='DD/MM/AAAA'; im='numeric'; ac='bday'; }
  else if(k==='whatsapp'){ ph='(12) 99999-9999'; type='tel'; im='tel'; ac='tel'; }
  else if(k==='email'){ ph='seuemail@exemplo.com'; type='email'; im='email'; ac='email'; cap='none'; }
  else if(conv.estado==='horarios') ph='Digite 1 ou 2';
  else if(conv.estado==='combinar') ph='Responda sim ou escreva a sua dúvida';
  else if(conv.estado==='validando'&&codigoAtivo){ ph='Código de 6 dígitos'; im='numeric'; }
  inp.type=type; inp.inputMode=im; inp.setAttribute('autocomplete',ac); inp.setAttribute('autocapitalize',cap); inp.placeholder=ph; }

 async function digitando(txt){ const ty=document.createElement('div'); ty.className='typing'; ty.setAttribute('role','status'); ty.setAttribute('aria-label','Digitando'); ty.innerHTML='<i></i><i></i><i></i>'; log.append(ty); log.scrollTop=log.scrollHeight; await espera(Math.min(900,250+txt.length*4)); ty.remove(); }
 async function enviar(texto){
  if(busy||!texto.trim()) return; busy=true; add('u',texto); inp.value='';
  try{
   if(codigoAtivo&&/^\d{6}$/.test(texto.replace(/\s/g,''))){ await codigoAtivo.enviar(texto); return; }
   if(!aberto){ aberto=true; track('chat_aberto'); carregarSlots(); }
   const antes=conv.estado;
   if(antes==='explicar'||/hor[aá]rio|agendar|marcar/i.test(texto)) await comPrazo(carregarSlots(),9000);
   const r=await responder(conv,texto,kb,{agora:agoraSP(),ocupados:[],slots:slotsServidor,l1,maxL1:3});
   await digitando(r.resposta); conv=r.conv; add('a',r.resposta);
   track('estado',{estado:conv.estado,camada:r.camada}); if(r.aprendizado) aprender(r.aprendizado,antes);
   atualizarLinks();
   if(r.acao==='handoff'){ cta.style.display='block'; }
   if(r.acao==='urgencia') cta.style.display='none';
   if(r.acao==='iniciar_conteudo') await iniciarConteudo();
   if(r.acao==='iniciar_agendamento') await iniciarAgendamento();
   if(r.acao==='mostrar_indicacao'){ if(sessao&&estado) cartaoIndicacao(); }
   if(r.acao==='ver_progresso'){ if(sessao){ const s=await api('status',{sessao},1); if(s.ok){ estado=s; cartaoIndicacao(); } } }
   if(r.depois){ await digitando(r.depois); add('a',r.depois); }
  }catch(e){
   document.querySelectorAll('.typing').forEach(x=>x.remove());
   add('a','Peço desculpas, tive uma instabilidade aqui. Para você não perder tempo, a nossa equipe continua pelo WhatsApp '+CFG.whatsapp_oficial_exibicao+', no botão abaixo.'); atualizarLinks(); cta.style.display='block';
  }finally{ render(); ajustarEntrada(); const alt=document.querySelector('.alt'); if(alt) alt.style.display=(cta.style.display==='block')?'none':''; log.scrollTop=log.scrollHeight; busy=false; if(matchMedia('(hover:hover)').matches&&!codigoAtivo) inp.focus({preventScroll:true}); } }

 function render(){
  chips.innerHTML='';
  const ordem={inicio:0,objetivo:1,regiao:2,dor:3,tempo:3,tentativas:4,prazo:4,explicar:5,horarios:6,combinar:6,dados:7,cadastro:7,validando:7,termo:7,reserva:8,indicacao:8,indicacao_ativa:8,handoff:8,encerrado:8}; pg.style.width=Math.round(((ordem[conv.estado]??0)/8)*100)+'%';
  const d=conv.dados, coletando=conv.estado==='dados'||conv.estado==='cadastro';
  const falta = coletando ? (!d.lgpd?'lgpd':(!d.nome||(conv.coleta!=='conteudo'&&!d.nome_completo))?'nome':(conv.coleta!=='conteudo'&&!d.nascimento)?'nascimento':!d.whatsapp?'whatsapp':!d.email?'email':(conv.coleta!=='conteudo'&&d.cidade===undefined)?'cidade':(conv.coleta!=='conteudo'&&!d.ref&&d.como_conheceu===undefined)?'como_conheceu':'') : '';
  const duv = conv.duvida ? conv.duvida.ids.map(id=>(kb.intents.find(x=>x.id===id)||{}).rotulo).filter(Boolean).concat(['Outra dúvida']) : null;
  const opts = duv ? duv : falta==='lgpd' ? ['Sim, concordo','Não']
   : falta==='cidade' ? ['São José dos Campos','Outra cidade do Vale','Outra cidade']
   : falta==='como_conheceu' ? ['Instagram','Google','Indicação de alguém','Outro']
   : conv.estado==='dor' ? ['Prefiro não detalhar']
   : conv.estado==='tempo' ? ['Menos de 6 meses','De 6 meses a 2 anos','Mais de 2 anos']
   : conv.estado==='tentativas' ? ['Treino e alimentação','Outro procedimento estético','Ainda não tentei nada','Prefiro não dizer']
   : conv.estado==='prazo' ? ['Sim, nos próximos 3 meses','Sim, mais para frente','Não tenho data']
   : conv.estado==='horarios' && conv.slots ? conv.slots.slice(0,2).map((x,i)=>(i+1)+') '+x.rotulo)
   : conv.estado==='combinar' ? ['Sim, podemos seguir','Por que a reserva?','A reserva é devolvida?']
   : conv.estado==='inicio' ? ['Abdome','Flancos','Papada','Braços','Coxas','Rosto','Quero os e-books e guias']
   : conv.estado==='objetivo' ? ['Abdome','Flancos','Papada','Braços','Coxas','Rosto']
   : conv.estado==='regiao' ? ['Abdome','Flancos','Papada','Braços','Coxas','Rosto']
   : conv.estado==='explicar' ? ['Sim, quero ver horários','Quanto custa?']
   : conv.estado==='indicacao' ? [d.validado?'Quero indicar':'Quero receber os materiais','Como funciona?','Agora não']
   : conv.estado==='handoff' && conv.conviteOfertado && !conv.semConvite ? ['Quero receber os materiais','Como funciona?']
   : conv.estado==='indicacao_ativa' ? (conv.escolha ? ['Atualizar minhas indicações'] : ['Atualizar minhas indicações','Quero agendar minha avaliação'])
   : [];
  for(const o of opts){ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=o; b.onclick=()=>enviar(conv.estado==='horarios'?o.slice(0,1):o); chips.append(b); } }

 function agoraSP(){ const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const g=t=>+p.find(x=>x.type===t).value; return {y:g('year'),m:g('month'),d:g('day'),h:g('hour'),min:g('minute')}; }

 // ---------------------------------------------------------------- FAQ a partir da base (um só lugar para o texto)
 const faqIds=['sem_aspirar','flacidez_irregular','risco','pos','prazo','gordura_volta','preco','reserva','quem_faz','confianca','convenio','biblioteca'], faq=$('faq');
 const perg={confianca:'Como confirmo que estou falando com o Instituto Couto?',sem_aspirar:'Sem aspirar, a gordura sai mesmo?',flacidez_irregular:'E a flacidez? A pele pode ficar irregular?',risco:'Dói? Existe risco de queimadura?',pos:'Vou ficar muito tempo parada? Como é o pós?',prazo:'Quando aparece o resultado? É definitivo?',gordura_volta:'Preciso emagrecer antes? A gordura volta?',preco:'Por que o preço não está na página?',reserva:'Por que a avaliação tem reserva de R$ 300?',quem_faz:'Quem realiza o procedimento?',convenio:'Vocês aceitam convênio?',biblioteca:'Como recebo os e-books, os guias e as aulas?'};
 for(const id of faqIds){ const it=kb.intents.find(i=>i.id===id); if(!it) continue;
  const d=document.createElement('details'), s=document.createElement('summary'), p=document.createElement('p'); s.textContent=perg[id];
  p.textContent=fill(it.faq||[].concat(it.resposta)[0],{avaliacao_minutos:CFG.avaliacao_minutos,reserva:CFG.reserva_valor,meta:META}).split('Para eu te orientar')[0].split('Quer que eu veja')[0].replace(/\s*Quer [^.?!]*\?\s*$/,'').trim();
  d.append(s,p); faq.append(d); }
 document.querySelectorAll('[data-cta]').forEach(a=>a.addEventListener('click',e=>{ track('cta',{canal:a.dataset.cta}); e.preventDefault(); $('chat').scrollIntoView({block:'center'});
  if(a.dataset.msg) setTimeout(()=>enviar(a.dataset.msg),450); else setTimeout(()=>inp.focus({preventScroll:true}),350); }));
 f.addEventListener('submit',e=>{e.preventDefault();enviar(inp.value);});

 // ---------------------------------------------------------------- abertura: convite, retorno ou atendimento normal
 async function abrirConvite(){
  faixa.style.display='block'; faixa.textContent='Você chegou por um convite';
  const r=await api('convite',{token:tokenConvite},1);
  if(!r.ok){ add('a','Este convite não está mais disponível, mas você pode receber os materiais do mesmo jeito: é só me pedir por aqui.'); return abrirNormal(); }
  faixa.textContent='Convite de '+r.indicador;
  add('a',fill(M.convidado_boas_vindas,{nome:r.primeiro_nome?', '+r.primeiro_nome:'',de:r.indicador}));
  const c=cartao('Receber os materiais');
  c.append(el('p',{text:'Vamos enviar um código de confirmação para '+r.email_mascara+'.'}));
  const ck=el('input',{type:'checkbox',id:'ck-lgpd'}), lb=el('label',{for:'ck-lgpd',class:'ck'},ck,el('span',{},document.createTextNode('Concordo com o uso dos meus dados para receber os materiais, conforme a '),el('a',{href:'#privacidade',text:'política de privacidade'}),document.createTextNode('.')));
  const outro=el('input',{type:'email',inputmode:'email',placeholder:'Outro e-mail (opcional)',autocapitalize:'none','aria-label':'Usar outro e-mail',maxlength:'120',class:'oculto'});
  const b1=el('button',{type:'button',class:'pri',text:'Enviar código'}), b2=el('button',{type:'button',class:'lnk',text:'Usar outro e-mail'}), b3=el('button',{type:'button',class:'lnk',text:'Não quero receber'}), er=linha();
  c.append(lb,outro,el('div',{class:'acoes'},b1),er,el('div',{class:'rodape'},b2,b3));
  b2.onclick=()=>{ outro.classList.remove('oculto'); outro.focus(); b2.remove(); };
  b3.onclick=async()=>{ await api('recusar',{token:tokenConvite}); c.remove(); add('a','Tudo bem, respeito a sua escolha: não enviaremos outro e-mail. Se mudar de ideia, é só voltar aqui.'); };
  b1.onclick=async()=>{ er.textContent=''; if(!ck.checked) return er.textContent=ERRO.consentimento; const em=outro.value.trim(); if(em&&!validarEmail(em)) return er.textContent=ERRO.email;
   const volta=ocupado(b1,'Enviando…'); const a=await api('aceitar',{token:tokenConvite,consent:true,email:em||undefined,canal:origem.utm_source==='whatsapp'?'whatsapp':''}); volta();
   if(!a.ok) return er.textContent=msgErro(a);
   sessao=a.sessao; c.classList.add('feito'); [lb,outro,b1.parentNode,b2,b3].forEach(x=>x&&x.remove&&x.remove()); track('convite_aceito');
   conv.dados.lgpd=true; conv.dados.lgpd_versao=CFG.lgpd_versao; conv.dados.ref='convite'; conv.dados.como_conheceu='Indicação';
   cartaoCodigo(a.email_mascara,async e=>{ conv.validacao='conteudo'; conv=aposValidar(conv); conv.dados.nome=e.primeiro_nome||''; guardar('lp_nome',e.primeiro_nome||'');
    await fala(fill(M.conteudo_liberado,{nome:e.primeiro_nome||''})); cartaoMateriais(e); cartaoIndicacao(); cartaoAulas(e); await fala(M.pos_conteudo); render(); ajustarEntrada(); }); };
  render(); }
 async function abrirNormal(){
  add('a',variante==='abertura_B'&&kb.mensagens.abertura_escuta?M.abertura_escuta:M.abertura);
  render(); ajustarEntrada();
  if(sessao&&API){ const s=await api('status',{sessao},1);
   if(s.ok&&s.validado){ estado=s; conv.dados.validado=true; conv.dados.lgpd=true; conv.dados.lgpd_versao=CFG.lgpd_versao; conv.conviteOfertado=true;
    faixa.style.display='block'; faixa.textContent=''; const b=el('button',{type:'button',class:'faixa-btn',text:'Bem-vinda(o) de volta, '+s.primeiro_nome+' · ver seus materiais e indicações'}); faixa.append(b);
    b.onclick=()=>{ faixa.style.display='none'; add('a',fill(M.volta,{nome:s.primeiro_nome})); cartaoMateriais(estado); cartaoIndicacao(); cartaoAulas(estado); }; }
   else if(!s.ok){ sessao=''; guardar('lp_sessao',null); } } }
 track('visita',{convite:!!tokenConvite});
 if(tokenConvite) abrirConvite(); else abrirNormal();
 carregarSlots();   // aquece o backend e já traz os horários reais
 // botão flutuante só quando o chat sai da tela
 const bar=$('bar'); let chatVis=true; const updBar=()=>bar.classList.toggle('show',!chatVis&&scrollY>320);
 if('IntersectionObserver' in window){ new IntersectionObserver(es=>{chatVis=es[0].isIntersecting;updBar();},{threshold:0}).observe($('chat')); addEventListener('scroll',updBar,{passive:true}); }
})();
