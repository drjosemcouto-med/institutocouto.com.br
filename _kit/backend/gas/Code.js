// =====================================================================================================
// Backend da landing Endolaser — Google Apps Script (roda na conta do Dr. José M Couto, custo zero).
// Este arquivo fica no Google Drive e é carregado pelo 'carregador' (Code.gs do projeto Apps Script), que define doPost/doGet/tarefasPeriodicas.
// Base: planilha Google "Landing Endolaser · Instituto Couto". E-mail: Gmail da conta. Agenda: Google Agenda.
// A página chama este web app com POST {acao, ...}. Nada de Lovable, Sofia ou serviço pago.
// =====================================================================================================
var VERSAO = '1.6.0';
var TZ = 'America/Sao_Paulo';
var ADMIN_CHAVE = 'REDIGIDO';
var INTEGRACAO_CHAVE = 'REDIGIDO';   // só leitura da exportação para o HÓRUS (v1.5.0)
var TABELAS = {
  Pessoas: ['id', 'criado_em', 'nome', 'whatsapp', 'email', 'nascimento', 'cidade', 'como_conheceu', 'cpf', 'consent_em', 'consent_versao', 'origem',
            'validado_em', 'indicacao_id', 'aulas_liberadas_em', 'tipo'],
  Sessoes: ['token', 'pessoa_id', 'email_destino', 'otp_hash', 'otp_expira', 'tentativas', 'envios', 'ultimo_envio', 'indicacao_id', 'validada_em', 'criado_em'],
  Indicacoes: ['id', 'criado_em', 'indicador_id', 'indicador_nome', 'token', 'nome', 'whatsapp', 'email', 'status', 'pessoa_id', 'canal', 'aberto_em', 'validado_em'],
  Reservas: ['id', 'criado_em', 'pessoa_id', 'nome', 'whatsapp', 'email', 'slot_inicio', 'slot_rotulo', 'regiao', 'objetivo', 'dor', 'tempo', 'tentativas', 'prazo',
             'status', 'termo', 'termo_em', 'termo_versao', 'termo_hash', 'termo_pdf', 'cpf', 'pix', 'evento_id', 'expira_em', 'observacao'],
  Emails: ['id', 'criado_em', 'para', 'assunto', 'finalidade', 'status', 'erro', 'enviado_em', 'texto', 'html'],
  Config: ['chave', 'valor', 'descricao'],
  Acessos: ['quando', 'pessoa_id', 'material', 'resultado', 'link_id'],
  Eventos: ['quando', 'sessao', 'tipo', 'estado', 'canal', 'formato', 'conteudo', 'campanha', 'variante', 'dispositivo'],
  Perguntas: ['quando', 'sessao', 'modo', 'texto', 'intent', 'estado', 'canal', 'variante', 'status', 'tratado_em', 'nota']   // v1.6.0: treino diário do chat
};
var CFG_PADRAO = {
  meta_indicacoes: 5, max_indicacoes: 10, hold_horas: 12, reserva_valor: 300,
  base_url: 'https://institutocouto.com.br', remetente: 'Instituto Couto · Dr. José M Couto', aviso_email: 'drjosemcouto@gmail.com',
  whatsapp: '5512991843887', whatsapp_exibicao: '(12) 99184-3887', calendar_id: '', consent_versao: 'v3-landing', termo_versao: 'v1 · 18/11/2026',
  agenda: { manha_inicio: '08:00', manha_ultimo_inicio: '11:00', tarde_inicio: '14:00', tarde_fim: '18:00', avaliacao_minutos: 30, janela_dias: 3,
            dias_avaliacao: [1, 2, 3, 4], antecedencia_min: 60 },
  materiais: [], aulas: [], aula_agendamento: '',
  // Cadência de e-mail (v1.4.0). transacional = pedido pela pessoa (código, reserva, confirmação, materiais, aulas): sai na hora.
  cadencia: { resumo_equipe_horas: [8, 12, 17], convite_janela: [8, 20], max_por_pessoa_24h: 3, teste_envio_real: false }
};
var TERMO = [
  ['1. Partes', 'CONTRATADA: JMCJ Serviços e Soluções em Saúde Ltda., nome fantasia Instituto Couto de Medicina Avançada, CNPJ 35.000.039/0001-93, Av. São João, 2375, sala 902, Ed. Helbor Offices, Jardim das Colinas, São José dos Campos/SP, CEP 12242-000, representada pelo médico Dr. José M Couto, CRM-SP 209089. PACIENTE: a pessoa identificada abaixo, maior de 18 anos.'],
  ['2. Objeto', 'Avaliação médica presencial e individual com o Dr. José M Couto, com cerca de 30 minutos reservados na agenda, para analisar a indicação de Endolaser: conversa sobre histórico de saúde, exame da região, medições, fotos padronizadas para o prontuário e bioimpedância. O médico pode solicitar exames complementares, como ultrassom, realizados e pagos à parte quando indicados. A avaliação não é o procedimento, não obriga a contratação e a indicação pode ser negada se não houver segurança ou benefício esperado.'],
  ['3. Atendimento particular', 'O atendimento é particular. O Instituto não atende por convênio ou plano de saúde e não emite guias. O recibo ou a nota fiscal podem ser solicitados para eventual reembolso, que é tratado diretamente pelo PACIENTE com a sua operadora.'],
  ['4. Reserva e confirmação', 'A avaliação custa R$ 300,00, pagos como reserva do horário, via Pix para a chave CNPJ 35.000.039/0001-93 (JMCJ Serviços e Soluções em Saúde Ltda.). O horário só é confirmado depois de (a) aceito este termo e (b) identificado o pagamento na conta do Instituto. Esse valor corresponde ao tempo reservado com o médico e não é abatido do valor de um eventual procedimento. O Instituto não envia link de pagamento.'],
  ['5. Remarcação, atraso e falta', 'É possível remarcar uma vez, pelo WhatsApp oficial, com no mínimo 24 horas de antecedência. Sem esse aviso, ou em caso de falta, a reserva não é devolvida, por cobrir o tempo reservado e os custos administrativos. A tolerância de atraso é de 15 minutos; depois disso, o atendimento pode precisar ser remarcado.'],
  ['6. Compromissos do PACIENTE', 'Informar de forma completa e verdadeira doenças, cirurgias, alergias, gestação ou amamentação, uso de anticoagulantes e todos os medicamentos e suplementos em uso; trazer documento com foto e exames recentes, se tiver; seguir as orientações de preparo. A omissão de informação pode comprometer a segurança da avaliação.'],
  ['7. Limites', 'A avaliação não é atendimento de urgência e não garante indicação, resultado estético ou medidas. Em caso de dor intensa, falta de ar, desmaio, sangramento importante ou qualquer situação de risco de vida, ligue 192 (SAMU) ou procure o pronto-socorro.'],
  ['8. Imagens e dados', 'Fotos e medições fazem parte do prontuário, de guarda obrigatória e sigilosa. O uso de imagem para divulgação exige autorização separada, que pode ser negada sem nenhum prejuízo. Os dados são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018); o PACIENTE pode pedir acesso, correção ou exclusão pelo WhatsApp oficial, observadas as obrigações legais de guarda do prontuário.'],
  ['9. Aceite eletrônico', 'O PACIENTE aceita este termo eletronicamente, com e-mail confirmado por código, registro de data, hora, versão do texto e resumo criptográfico (hash), com validade de assinatura eletrônica simples nos termos da Lei 14.063/2020 e da Medida Provisória 2.200-2/2001.'],
  ['10. Foro', 'Comarca de São José dos Campos/SP, sem prejuízo dos direitos do consumidor previstos em lei.']
];

// ------------------------------------------------------------------------------------------------- utilidades
function agoraIso_() { return new Date().toISOString(); }
function fmtSP_(d, f) { return Utilities.formatDate(d, TZ, f); }
function dataSP_(chave) { return new Date(chave.replace(' ', 'T') + ':00-03:00'); }   // 'YYYY-MM-DD HH:MM' (Brasil sem horário de verão)
function agoraSP_() { var s = fmtSP_(new Date(), 'yyyy-MM-dd HH:mm'); return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10), h: +s.slice(11, 13), min: +s.slice(14, 16) }; }
function uuid_() { return Utilities.getUuid(); }
function hex_(n) { var s = ''; while (s.length < n) s += uuid_().replace(/-/g, ''); return s.slice(0, n); }
function sha_(t) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function codigo6_() { return ('000000' + (parseInt(uuid_().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6); }
function tel_(t) { var d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, ''); return /^[1-9]\d9\d{8}$/.test(d) ? '55' + d : null; }
function emailOk_(e) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e || '') && String(e).length <= 120; }
function nomeOk_(n) { n = String(n || '').trim(); return n.length >= 5 && n.length <= 80 && !/[0-9@<>"&;]/.test(n) && n.split(/\s+/).filter(function (w) { return w.length >= 2; }).length >= 2; }
function cpfOk_(c) {
  var d = String(c || '').replace(/\D/g, ''); if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +d[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +d[t]) return false; }
  return true;
}
function titulo_(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, function (x) { return x.toUpperCase(); }).replace(/\s(Da|De|Do|Das|Dos|E)\s/g, function (x) { return x.toLowerCase(); }); }
function primeiro_(n) { return titulo_(String(n || '').split(' ')[0]); }
function mascara_(e) { var p = String(e).split('@'), dom = p[1] || ''; return p[0].slice(0, 1) + '•••@' + dom.slice(0, 1) + '•••.' + dom.split('.').pop(); }
function esc_(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function limite_(chave, max, seg) {   // janela fixa no cache do script
  var c = CacheService.getScriptCache(), k = 'lim:' + sha_(chave).slice(0, 40), n = +(c.get(k) || 0);
  if (n >= max) return false; c.put(k, String(n + 1), seg); return true;
}

// ------------------------------------------------------------------------------------------------- base (planilha)
function planilha_() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty('PLANILHA_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { } }
  var ss = SpreadsheetApp.create('Landing Endolaser · Instituto Couto (base da landing — não apagar)');
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TABELAS).forEach(function (nome, i) {
    var sh = i === 0 ? ss.getSheets()[0].setName(nome) : ss.insertSheet(nome), h = TABELAS[nome];
    sh.getRange(1, 1, 1000, h.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0E0D0C').setFontColor('#E2C27A');
    sh.setFrozenRows(1);
  });
  var cfg = ss.getSheetByName('Config');
  cfg.getRange(2, 1, 4, 3).setValues([
    ['materiais', '[]', 'Lista JSON [{"id","titulo","url"}] dos PDFs entregues após o código'],
    ['aulas', '[]', 'Lista JSON [{"id","titulo","url"}]; url vazia = em gravação'],
    ['aula_agendamento', '', 'Link da aula do Endolaser enviada a quem faz a pré-reserva (vazio = ainda não gravada)'],
    ['calendar_id', '', 'Agenda usada (vazio = agenda principal da conta)']]);
  var res = ss.getSheetByName('Reservas');
  res.getRange(1, TABELAS.Reservas.indexOf('pix') + 1).setNote('Equipe: troque para "pago" quando o Pix for identificado na conta. Com o termo aceito, o horário confirma sozinho em até 10 min.');
  pr.setProperty('PLANILHA_ID', ss.getId());
  return ss;
}

function Store_() { this.ss = planilha_(); this.t = {}; }
Store_.prototype.tab = function (nome) {
  if (this.t[nome]) return this.t[nome];
  var sh = this.ss.getSheetByName(nome), h = TABELAS[nome];
  if (!sh) { sh = this.ss.insertSheet(nome); sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0E0D0C').setFontColor('#E2C27A'); sh.setFrozenRows(1); }
  var v = sh.getDataRange().getValues();
  var rows = v.slice(1).map(function (r, i) { var o = { _row: i + 2 }; h.forEach(function (c, j) { o[c] = r[j] === '' ? '' : String(r[j]); }); return o; });
  return (this.t[nome] = { sh: sh, h: h, rows: rows });
};
Store_.prototype.todos = function (nome) { return this.tab(nome).rows; };
Store_.prototype.um = function (nome, campo, valor) { var r = this.tab(nome).rows; for (var i = r.length - 1; i >= 0; i--) if (r[i][campo] === String(valor)) return r[i]; return null; };
Store_.prototype.inserir = function (nome, o) {
  var t = this.tab(nome), linha = t.h.map(function (c) { return o[c] == null ? '' : String(o[c]); }), r = t.sh.getLastRow() + 1;
  if (r > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), 500);
  t.sh.getRange(r, 1, 1, t.h.length).setNumberFormat('@').setValues([linha]);   // texto puro: telefone e data não viram número
  o._row = r; t.rows.push(o); return o;
};
Store_.prototype.salvar = function (nome, o) {
  var t = this.tab(nome); t.sh.getRange(o._row, 1, 1, t.h.length).setNumberFormat('@').setValues([t.h.map(function (c) { return o[c] == null ? '' : String(o[c]); })]);
};
function cfg_(db) {
  var c = JSON.parse(JSON.stringify(CFG_PADRAO));
  db.todos('Config').forEach(function (r) { if (!r.chave) return; var v = r.valor; try { v = JSON.parse(v); } catch (e) { } if (v !== '' && v != null) c[r.chave] = v; });
  return c;
}

// ------------------------------------------------------------------------------------------------- e-mail (Gmail da conta)
function moldura_(titulo, corpo, cfg) {
  return '<!doctype html><html><body style="margin:0;background:#FAF7F0;font:17px/1.6 Arial,sans-serif;color:#1B1A18"><div style="max-width:560px;margin:0 auto;padding:28px 20px">' +
    '<div style="font:600 13px Arial;letter-spacing:.18em;color:#7A5F1E;text-transform:uppercase">Instituto Couto de Medicina Avançada</div>' +
    '<h1 style="font:600 26px/1.2 Georgia,serif;margin:10px 0 16px;color:#0E0D0C">' + esc_(titulo) + '</h1>' + corpo +
    '<p style="margin-top:28px;font-size:14px;color:#6B665B">Dúvidas? Fale com a equipe no WhatsApp oficial: <a href="https://wa.me/' + cfg.whatsapp + '" style="color:#7A5F1E">' + cfg.whatsapp_exibicao + '</a><br>' +
    'Dr. José M Couto · CRM-SP 209089 · Av. São João, 2375, sala 902, São José dos Campos/SP<br>JMCJ Serviços e Soluções em Saúde Ltda. · CNPJ 35.000.039/0001-93</p></div></body></html>';
}
function botao_(url, rotulo) { return '<p><a href="' + esc_(url) + '" style="display:inline-block;background:#0E0D0C;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">' + esc_(rotulo) + '</a></p>'; }
// Envia na hora, sem reserva de cota por finalidade. Se o Google recusar o envio, o e-mail fica na fila e a tarefa
// periódica (a cada 10 min) tenta de novo, código e agenda primeiro.
var ORDEM_ = { codigo: 0, equipe: 1, reserva: 1, confirmacao: 1, materiais: 2, convite: 2, aulas: 2 };
function piso_(f) { return 1; }
// ------------------------------------------------------------------ cadência de e-mail (v1.4.0)
// 1) e-mail de teste (+teste/+landing) é registrado como 'simulado' e não sai (a bateria lê o código na planilha);
// 2) aviso à equipe não sai um por evento: vira 'resumo' e segue num único e-mail nos horários de cadencia.resumo_equipe_horas;
// 3) mesmo assunto para a mesma pessoa em 24 h não sai duas vezes; 4) no máximo N e-mails não pedidos por pessoa em 24 h;
// 5) convite a quem foi indicado só sai entre as horas de cadencia.convite_janela (fora disso, espera na fila).
function cad_(cfg) { var c = cfg.cadencia || {}; return { horas: c.resumo_equipe_horas || [8, 12, 17], janela: c.convite_janela || [8, 20], max: c.max_por_pessoa_24h || 3, real: !!c.teste_envio_real }; }
function ehTeste_(para) { return /\+(landing|teste)/i.test(String(para || '')); }
var LIVRES_ = { codigo: 1, reserva: 1, confirmacao: 1 };
function bloqueioCadencia_(db, cfg, para, assunto, finalidade) {
  var c = cad_(cfg), agora = Date.now(), dia = 864e5, p = String(para || '').toLowerCase();
  if (finalidade === 'convite') { var h = agoraSP_().h; if (h < c.janela[0] || h >= c.janela[1]) return 'janela'; }
  var recentes = db.todos('Emails').filter(function (x) { return String(x.para || '').toLowerCase() === p && x.status === 'enviado' && agora - Date.parse(x.enviado_em || x.criado_em) < dia; });
  if (finalidade !== 'codigo' && recentes.some(function (x) { return x.assunto === assunto; })) return 'duplicado';
  if (!LIVRES_[finalidade] && recentes.filter(function (x) { return !LIVRES_[x.finalidade]; }).length >= c.max) return 'cadencia';
  return '';
}
function email_(db, cfg, para, assunto, titulo, corpo, texto, finalidade, anexo) {
  var html = moldura_(titulo, corpo, cfg), reg = db.inserir('Emails', { id: uuid_(), criado_em: agoraIso_(), para: para, assunto: assunto, finalidade: finalidade, status: 'pendente', texto: texto, html: html });
  if (ehTeste_(para) && !cad_(cfg).real) { reg.status = 'simulado'; reg.html = ''; db.salvar('Emails', reg); return true; }
  if (finalidade === 'equipe') { reg.status = 'resumo'; reg.html = ''; db.salvar('Emails', reg); return true; }
  var b = bloqueioCadencia_(db, cfg, para, assunto, finalidade);
  if (b === 'duplicado') { reg.status = 'duplicado'; reg.html = ''; db.salvar('Emails', reg); return true; }
  if (b) { reg.erro = b; db.salvar('Emails', reg); return true; }   // espera na fila; a tarefa periódica envia quando a cadência permitir
  var cota = MailApp.getRemainingDailyQuota();
  if (cota < 1) { reg.erro = 'fila'; db.salvar('Emails', reg); return false; }
  try {
    var op = { htmlBody: html, name: cfg.remetente };
    if (anexo) op.attachments = [anexo];
    MailApp.sendEmail(para, assunto, texto, op);
    reg.status = 'enviado'; reg.enviado_em = agoraIso_(); reg.html = ''; db.salvar('Emails', reg); return true;
  } catch (e) { reg.status = 'pendente'; reg.erro = String(e).slice(0, 200); db.salvar('Emails', reg); return false; }   // fica na fila e é reenviado
}
// resumo único para a equipe: pré-reservas novas, o que aguarda Pix e o que expirou desde o último resumo
function resumoEquipe_(db, cfg, forcar) {
  var c = cad_(cfg), ag = agoraSP_(), pr = PropertiesService.getScriptProperties();
  var marca = ag.y + '-' + ag.m + '-' + ag.d + ' ' + ag.h;
  if (!forcar && (c.horas.indexOf(ag.h) < 0 || pr.getProperty('RESUMO_EQUIPE') === marca)) return false;
  var itens = db.todos('Emails').filter(function (x) { return x.status === 'resumo'; });
  var pend = db.todos('Reservas').filter(function (r) { return r.status === 'pre_reserva' && !ehTeste_(r.email); });
  pr.setProperty('RESUMO_EQUIPE', marca);
  if (!itens.length && !pend.length) return false;
  var linhas = ['RESUMO DA LANDING ENDOLASER · ' + fmtSP_(new Date(), 'dd/MM HH:mm'), ''];
  if (itens.length) { linhas.push('Novidades desde o último resumo (' + itens.length + '):'); itens.forEach(function (x) { linhas.push('• ' + x.assunto); }); linhas.push(''); }
  if (pend.length) { linhas.push('Pré-reservas aguardando Termo e Pix (' + pend.length + '):');
    pend.forEach(function (r) { linhas.push('• ' + r.nome + ' · ' + r.slot_rotulo + ' · Termo: ' + r.termo + ' · Pix: ' + r.pix + ' · segura até ' + fmtSP_(new Date(r.expira_em), 'dd/MM HH:mm') + ' · wa.me/' + r.whatsapp); }); linhas.push(''); }
  linhas.push('Conferência do Pix: ' + cfg.base_url + '/ferramentas/#equipe');
  var texto = linhas.join('\n');
  try { MailApp.sendEmail(cfg.aviso_email, 'Landing Endolaser · resumo ' + fmtSP_(new Date(), 'dd/MM HH') + 'h', texto, { htmlBody: moldura_('Resumo da landing', '<pre style="font:15px/1.5 Arial;white-space:pre-wrap">' + esc_(texto) + '</pre>', cfg), name: cfg.remetente }); }
  catch (e) { return false; }
  itens.forEach(function (x) { x.status = 'resumido'; x.enviado_em = agoraIso_(); db.salvar('Emails', x); });
  return true;
}
function enviarCodigo_(db, cfg, s) {
  var cod = codigo6_();
  s.otp_hash = sha_(cod + s.token); s.otp_expira = new Date(Date.now() + 10 * 60e3).toISOString(); s.tentativas = '0';
  s.envios = String(+(s.envios || 0) + 1); s.ultimo_envio = agoraIso_(); db.salvar('Sessoes', s);
  return email_(db, cfg, s.email_destino, 'Seu código do Instituto Couto: ' + cod, 'Seu código de confirmação',
    '<p>Use este código para confirmar o seu e-mail na página do Dr. José M Couto:</p><p style="font:700 34px/1 Arial;letter-spacing:.18em;color:#0E0D0C;margin:18px 0">' + cod +
    '</p><p>O código vale por 10 minutos. Se você não pediu, ignore este e-mail.</p>', 'Seu código do Instituto Couto: ' + cod + ' (vale por 10 minutos).', 'codigo');
}

// ------------------------------------------------------------------------------------------------- links mascarados
// O endereço real (Drive/YouTube) nunca vai para o paciente: ele recebe base_url/m/?k=<token assinado>.
// Token = base64url("pessoa|material|expira") + "." + HMAC-SHA256 com segredo guardado só no script. Sem tabela: valida pela assinatura.
function segredo_() { var pr = PropertiesService.getScriptProperties(), k = pr.getProperty('LINK_SEGREDO'); if (!k) { k = hex_(48); pr.setProperty('LINK_SEGREDO', k); } return k; }
function b64u_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function assina_(corpo) { return b64u_(Utilities.computeHmacSha256Signature(corpo, segredo_())).slice(0, 27); }
function linkToken_(pessoa, material, dias) {
  var exp = (Math.floor(Date.now() / 864e5) + Math.max(1, Math.min(3650, +dias || 365))) * 86400;   // fim do dia: o mesmo link no mesmo dia
  var corpo = b64u_([pessoa, material, exp].join('|')); return corpo + '.' + assina_(corpo);
}
function linkLer_(k) {
  var x = String(k || '').trim().split('.'); if (x.length !== 2 || !x[0] || assina_(x[0]) !== x[1]) return null;
  try { var t = Utilities.newBlob(Utilities.base64DecodeWebSafe(x[0] + '==='.slice((x[0].length + 3) % 4))).getDataAsString().split('|');
    return t.length === 3 ? { p: t[0], m: t[1], e: +t[2], id: sha_(x[0]).slice(0, 12) } : null; } catch (e) { return null; }
}
function linkUrl_(cfg, pessoa, material, dias) { return cfg.base_url + '/m/?k=' + linkToken_(pessoa, material, dias); }
function material_(cfg, id) {
  var m = (cfg.materiais || []).filter(function (x) { return x.id === id; })[0]; if (m) return { id: m.id, titulo: m.titulo, url: m.url, aula: false };
  var a = (cfg.aulas || []).filter(function (x) { return x.id === id; })[0]; if (a) return { id: a.id, titulo: a.titulo, url: a.url, aula: true };
  if (id === 'aula-agendamento') return { id: id, titulo: 'Aula do Dr. Couto sobre Endolaser', url: cfg.aula_agendamento, aula: false };
  return null;
}
function driveId_(url) { var m = /\/d\/([\w-]{20,})/.exec(url || '') || /[?&]id=([\w-]{20,})/.exec(url || ''); return m ? m[1] : ''; }
function revogados_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LINKS_REVOGADOS') || '[]'); } catch (e) { return []; } }
// diagnóstico de um link: válido ou o motivo (usado pela abertura e pela ferramenta de validação)
function linkChecar_(db, cfg, k) {
  var t = linkLer_(k); if (!t) return { valido: false, motivo: 'assinatura' };
  var m = material_(cfg, t.m), p = t.p === '*' ? null : db.um('Pessoas', 'id', t.p), r = { t: t, m: m, p: p, valido: false };
  if (revogados_().indexOf(t.id) >= 0) r.motivo = 'revogado';
  else if (t.e * 1000 < Date.now()) r.motivo = 'expirado';
  else if (!m) r.motivo = 'material';
  else if (t.p !== '*' && (!p || !p.validado_em)) r.motivo = 'pessoa';
  else if (m.aula && t.p !== '*' && !p.aulas_liberadas_em) r.motivo = 'bloqueado';
  else if (!m.url) r.motivo = 'em_gravacao';
  else { r.valido = true; r.motivo = 'ok'; }
  return r;
}

// ------------------------------------------------------------------------------------------------- estado devolvido à página
function estado_(db, cfg, p) {
  var inds = db.todos('Indicacoes').filter(function (i) { return i.indicador_id === p.id; });
  var lib = !!p.aulas_liberadas_em;
  return {
    ok: true, validado: !!p.validado_em, primeiro_nome: primeiro_(p.nome), meta: cfg.meta_indicacoes, max: cfg.max_indicacoes,
    validas: inds.filter(function (i) { return i.status === 'validado'; }).length,
    indicacoes: inds.map(function (i) { return { id: i.id, primeiro_nome: primeiro_(i.nome), status: i.status, whatsapp: i.whatsapp, link: cfg.base_url + '/convite/?' + i.token }; }),
    materiais: p.validado_em ? (cfg.materiais || []).map(function (m) { return { id: m.id, tipo: m.tipo, titulo: m.titulo, url: linkUrl_(cfg, p.id, m.id) }; }) : [],
    aulas_liberadas: lib, aulas: (cfg.aulas || []).map(function (a) { return lib && a.url ? { id: a.id, titulo: a.titulo, url: linkUrl_(cfg, p.id, a.id) } : { id: a.id, titulo: a.titulo }; })
  };
}
function sessaoValida_(db, token) { var s = db.um('Sessoes', 'token', token || '-'); return s && s.validada_em ? s : null; }

// ------------------------------------------------------------------------------------------------- ações
var ACOES = {
  // {nome, whatsapp, email, consent, tipo, nascimento?, cidade?, como_conheceu?, origem?, site (isca), t (ms na página)}
  iniciar: function (db, cfg, b) {
    if (b.site) return { ok: false, erro: 'limite' };
    if (b.consent !== true) return { ok: false, erro: 'consentimento' };
    var nome = titulo_(b.nome), w = tel_(b.whatsapp), email = String(b.email || '').trim().toLowerCase();
    if (!nomeOk_(nome)) return { ok: false, erro: 'nome' };
    if (!w) return { ok: false, erro: 'whatsapp' };
    if (!emailOk_(email)) return { ok: false, erro: 'email' };
    var nasc = b.nascimento ? String(b.nascimento) : '';
    if (nasc) { var dn = new Date(nasc + 'T12:00:00-03:00'), lim = new Date(); lim.setFullYear(lim.getFullYear() - 18); if (isNaN(dn) || dn > lim || dn.getFullYear() < 1900) return { ok: false, erro: 'nascimento' }; }
    if (!limite_('ini:' + w, 4, 3600) || !limite_('ini:e:' + email, 4, 3600) || !limite_('ini:global', 120, 600)) return { ok: false, erro: 'limite' };
    var p = db.um('Pessoas', 'whatsapp', w), dest = email;
    if (!p) {
      p = db.inserir('Pessoas', { id: uuid_(), criado_em: agoraIso_(), nome: nome, whatsapp: w, email: email, nascimento: nasc, cidade: String(b.cidade || '').slice(0, 60),
        como_conheceu: String(b.como_conheceu || '').slice(0, 60), consent_em: agoraIso_(), consent_versao: cfg.consent_versao, origem: JSON.stringify(b.origem || {}).slice(0, 300), tipo: b.tipo || 'conteudo' });
    } else if (!p.validado_em) {
      p.nome = nome; p.email = email; p.nascimento = nasc || p.nascimento; p.cidade = String(b.cidade || p.cidade || '').slice(0, 60);
      p.como_conheceu = String(b.como_conheceu || p.como_conheceu || '').slice(0, 60); p.consent_em = agoraIso_(); if (b.tipo === 'agendamento') p.tipo = 'agendamento'; db.salvar('Pessoas', p);
    } else {
      // já confirmada: o código vai ao e-mail confirmado; ninguém troca o e-mail de outra pessoa
      dest = p.email; p.nascimento = nasc || p.nascimento; p.cidade = String(b.cidade || p.cidade || '').slice(0, 60); p.como_conheceu = String(b.como_conheceu || p.como_conheceu || '').slice(0, 60);
      if (b.tipo === 'agendamento') p.tipo = 'agendamento'; db.salvar('Pessoas', p);
    }
    var s = db.inserir('Sessoes', { token: hex_(40), pessoa_id: p.id, email_destino: dest, envios: '0', criado_em: agoraIso_() });
    enviarCodigo_(db, cfg, s);
    return { ok: true, sessao: s.token, email_mascara: mascara_(dest), email_trocado: dest !== email };
  },
  // {sessao, nome?, nascimento?, cidade?, como_conheceu?} — quem já confirmou o e-mail completa o cadastro para agendar sem novo código
  perfil: function (db, cfg, b) {
    var s = sessaoValida_(db, b.sessao); if (!s) return { ok: false, erro: 'sessao' };
    var p = db.um('Pessoas', 'id', s.pessoa_id);
    if (b.nome) { var nome = titulo_(b.nome); if (!nomeOk_(nome)) return { ok: false, erro: 'nome' }; p.nome = nome; }
    if (b.nascimento) { var dn = new Date(String(b.nascimento) + 'T12:00:00-03:00'), lim = new Date(); lim.setFullYear(lim.getFullYear() - 18);
      if (isNaN(dn) || dn > lim || dn.getFullYear() < 1900) return { ok: false, erro: 'nascimento' }; p.nascimento = String(b.nascimento); }
    if (b.cidade != null) p.cidade = String(b.cidade).slice(0, 60);
    if (b.como_conheceu != null) p.como_conheceu = String(b.como_conheceu).slice(0, 60);
    p.tipo = 'agendamento'; db.salvar('Pessoas', p);
    return estado_(db, cfg, p);
  },
  reenviar: function (db, cfg, b) {
    var s = db.um('Sessoes', 'token', b.sessao || '-');
    if (!s || s.validada_em) return { ok: false, erro: 'sessao' };
    if (+s.envios >= 4 || (Date.now() - Date.parse(s.ultimo_envio)) < 45e3) return { ok: false, erro: 'aguarde' };
    enviarCodigo_(db, cfg, s); return { ok: true, email_mascara: mascara_(s.email_destino) };
  },
  validar: function (db, cfg, b) {
    var s = db.um('Sessoes', 'token', b.sessao || '-');
    if (!s) return { ok: false, erro: 'sessao' };
    var p = db.um('Pessoas', 'id', s.pessoa_id);
    if (s.validada_em) return estado_(db, cfg, p);
    if (+s.tentativas >= 5) return { ok: false, erro: 'tentativas' };
    if (Date.now() > Date.parse(s.otp_expira)) return { ok: false, erro: 'expirado' };
    if (sha_(String(b.codigo || '').replace(/\D/g, '') + s.token) !== s.otp_hash) {
      s.tentativas = String(+s.tentativas + 1); db.salvar('Sessoes', s); return { ok: false, erro: 'codigo', restantes: 5 - +s.tentativas };
    }
    s.validada_em = agoraIso_(); s.otp_hash = ''; db.salvar('Sessoes', s);
    var primeira = !p.validado_em;
    p.validado_em = p.validado_em || agoraIso_(); p.email = s.email_destino; db.salvar('Pessoas', p);
    // indicação: conta para quem indicou só se esta é a primeira confirmação desta pessoa (pessoa nova)
    var indId = s.indicacao_id || (primeira ? p.indicacao_id : ''), ind = indId ? db.um('Indicacoes', 'id', indId) : null;
    if (ind && (ind.status === 'enviado' || ind.status === 'aberto')) {
      ind.status = primeira ? 'validado' : 'nao_conta'; ind.pessoa_id = p.id; if (primeira) ind.validado_em = agoraIso_(); db.salvar('Indicacoes', ind);
      if (primeira) {
        var dono = db.um('Pessoas', 'id', ind.indicador_id);
        var n = db.todos('Indicacoes').filter(function (i) { return i.indicador_id === dono.id && i.status === 'validado'; }).length;
        if (n >= cfg.meta_indicacoes && !dono.aulas_liberadas_em) {
          dono.aulas_liberadas_em = agoraIso_(); db.salvar('Pessoas', dono);
          var lista = (cfg.aulas || []).map(function (a) { return '<li>' + esc_(a.titulo) + (a.url ? ' · <a href="' + esc_(linkUrl_(cfg, dono.id, a.id)) + '">assistir</a>' : ' · <i>em gravação: o link chega aqui assim que for publicada</i>') + '</li>'; }).join('');
          email_(db, cfg, dono.email, 'Suas aulas do Dr. José M Couto estão liberadas', primeiro_(dono.nome) + ', suas aulas estão liberadas',
            '<p>' + cfg.meta_indicacoes + ' pessoas que você indicou confirmaram o e-mail e já estão com os materiais. Obrigado por espalhar informação de qualidade.</p><p>Suas aulas:</p><ul>' + lista + '</ul><p style="font-size:14px;color:#6B665B">Os links são pessoais e abrem só por aqui.</p>', 'Suas aulas do Dr. José M Couto estão liberadas.', 'aulas');
        }
      }
    }
    if (primeira) {
      var mats = (cfg.materiais || []).map(function (m) { return '<li style="margin:6px 0"><a href="' + esc_(linkUrl_(cfg, p.id, m.id)) + '" style="color:#7A5F1E;font-weight:700">' + esc_(m.titulo) + '</a></li>'; }).join('');
      email_(db, cfg, p.email, 'Seus materiais do Dr. José M Couto', primeiro_(p.nome) + ', seus materiais chegaram',
        '<p>Aqui estão os e-books e guias do Dr. José M Couto. Os links são pessoais:</p><ul>' + mats + '</ul><p><b>Lembrou de alguém que também se beneficiaria?</b> Indique pela página: cada pessoa recebe os mesmos materiais, sem custo, e quando ' + cfg.meta_indicacoes +
        ' delas confirmarem o e-mail, as 5 aulas completas do Dr. Couto são liberadas para você.</p>' + botao_(cfg.base_url + '/endolaser/#biblioteca', 'Indicar pessoas'),
        'Seus materiais do Dr. José M Couto: ' + cfg.base_url + '/endolaser/#biblioteca', 'materiais');
    }
    return estado_(db, cfg, p);
  },
  status: function (db, cfg, b) { var s = sessaoValida_(db, b.sessao); return s ? estado_(db, cfg, db.um('Pessoas', 'id', s.pessoa_id)) : { ok: false, erro: 'sessao' }; },
  // {sessao, nome, whatsapp, email, canal?}
  indicar: function (db, cfg, b) {
    var s = sessaoValida_(db, b.sessao); if (!s) return { ok: false, erro: 'sessao' };
    var eu = db.um('Pessoas', 'id', s.pessoa_id), nome = titulo_(b.nome), w = tel_(b.whatsapp), email = String(b.email || '').trim().toLowerCase();
    if (!nomeOk_(nome)) return { ok: false, erro: 'nome' };
    if (!w) return { ok: false, erro: 'whatsapp' };
    if (!emailOk_(email)) return { ok: false, erro: 'email' };
    if (w === eu.whatsapp || email === eu.email) return { ok: false, erro: 'proprio' };
    var minhas = db.todos('Indicacoes').filter(function (i) { return i.indicador_id === eu.id; });
    if (minhas.some(function (i) { return i.whatsapp === w || i.email === email; })) return { ok: false, erro: 'repetido' };
    if (minhas.length >= cfg.max_indicacoes) return { ok: false, erro: 'maximo' };
    if (!limite_('ind:' + eu.id, 15, 3600)) return { ok: false, erro: 'limite' };
    var jaExiste = db.todos('Pessoas').some(function (x) { return x.validado_em && (x.whatsapp === w || x.email === email); });
    var ind = db.inserir('Indicacoes', { id: uuid_(), criado_em: agoraIso_(), indicador_id: eu.id, indicador_nome: eu.nome, token: hex_(12), nome: nome, whatsapp: w, email: email,
      status: jaExiste ? 'nao_conta' : 'enviado', canal: String(b.canal || '').slice(0, 20) });
    var link = cfg.base_url + '/convite/?' + ind.token;
    if (!jaExiste) email_(db, cfg, email, primeiro_(eu.nome) + ' indicou você para receber os materiais do Dr. José M Couto', primeiro_(nome) + ', você recebeu um convite',
      '<p>' + esc_(primeiro_(eu.nome)) + ' lembrou de você e indicou o seu e-mail para receber, sem custo, os e-books e guias do Dr. José M Couto, médico em São José dos Campos, sobre contorno corporal, emagrecimento, saúde da mulher, vitaminas e envelhecimento saudável.</p>' +
      '<p>Para receber, é só confirmar o seu e-mail com um código (leva 1 minuto):</p>' + botao_(link, 'Quero receber') +
      '<p style="font-size:14px;color:#6B665B">Se você não conhece quem indicou ou não quer receber, ignore este e-mail. Não enviaremos outro.</p>',
      primeiro_(eu.nome) + ' indicou você para receber os materiais do Dr. José M Couto: ' + link, 'convite');
    return { ok: true, id: ind.id, status: ind.status, link: link, estado: estado_(db, cfg, eu) };
  },
  convite: function (db, cfg, b) {
    var i = db.um('Indicacoes', 'token', String(b.token || '-').toLowerCase()); if (!i) return { ok: false, erro: 'convite' };
    if (i.status === 'enviado') { i.status = 'aberto'; i.aberto_em = agoraIso_(); db.salvar('Indicacoes', i); }
    return { ok: true, primeiro_nome: primeiro_(i.nome), indicador: primeiro_(i.indicador_nome), email_mascara: mascara_(i.email), status: i.status };
  },
  // {token, consent, email?, canal?}
  aceitar: function (db, cfg, b) {
    if (b.consent !== true) return { ok: false, erro: 'consentimento' };
    var i = db.um('Indicacoes', 'token', String(b.token || '-').toLowerCase()); if (!i || i.status === 'recusado') return { ok: false, erro: 'convite' };
    var email = String(b.email || i.email).trim().toLowerCase(); if (!emailOk_(email)) return { ok: false, erro: 'email' };
    if (!limite_('ini:' + i.whatsapp, 4, 3600) || !limite_('ini:global', 120, 600)) return { ok: false, erro: 'limite' };
    var p = db.um('Pessoas', 'whatsapp', i.whatsapp);
    if (!p) p = db.inserir('Pessoas', { id: uuid_(), criado_em: agoraIso_(), nome: i.nome, whatsapp: i.whatsapp, email: email, consent_em: agoraIso_(), consent_versao: cfg.consent_versao,
      origem: JSON.stringify({ utm_source: 'convite', canal: b.canal || i.canal || '' }), indicacao_id: i.id, tipo: 'conteudo' });
    else if (p.validado_em) email = p.email;
    else { p.email = email; p.consent_em = agoraIso_(); p.indicacao_id = i.id; db.salvar('Pessoas', p); }
    if (b.canal === 'whatsapp') { i.canal = 'whatsapp'; db.salvar('Indicacoes', i); }
    var s = db.inserir('Sessoes', { token: hex_(40), pessoa_id: p.id, email_destino: email, envios: '0', indicacao_id: i.id, criado_em: agoraIso_() });
    enviarCodigo_(db, cfg, s);
    return { ok: true, sessao: s.token, email_mascara: mascara_(email) };
  },
  recusar: function (db, cfg, b) {
    var i = db.um('Indicacoes', 'token', String(b.token || '-').toLowerCase());
    if (i && (i.status === 'enviado' || i.status === 'aberto')) { i.status = 'recusado'; db.salvar('Indicacoes', i); }
    return { ok: true };
  },
  horarios: function (db, cfg) { return { ok: true, slots: horarios_(db, cfg) }; },
  // {sessao, slot_inicio 'YYYY-MM-DD HH:MM', slot_rotulo, regiao, objetivo, dor, tempo, tentativas, prazo}
  reservar: function (db, cfg, b) {
    var s = sessaoValida_(db, b.sessao); if (!s) return { ok: false, erro: 'sessao' };
    if (!limite_('res:' + s.pessoa_id, 4, 3600)) return { ok: false, erro: 'limite' };
    var p = db.um('Pessoas', 'id', s.pessoa_id), chave = String(b.slot_inicio || '');
    var validos = horarios_(db, cfg, chave.slice(0, 10)).concat(horarios_(db, cfg));
    if (!validos.some(function (x) { return x.chave === chave; })) return { ok: true, slot_ok: false, slots: horarios_(db, cfg) };
    var ini = dataSP_(chave), fim = new Date(ini.getTime() + cfg.agenda.avaliacao_minutos * 60e3);
    var expira = new Date(Math.min(Date.now() + cfg.hold_horas * 3600e3, ini.getTime() - 2 * 3600e3));
    if (expira.getTime() < Date.now() + 30 * 60e3) expira = new Date(ini.getTime() - 30 * 60e3);   // horário próximo: segura até 30 min antes
    var t = function (x, n) { return String(b[x] || '').slice(0, n); };
    var r = db.inserir('Reservas', { id: uuid_(), criado_em: agoraIso_(), pessoa_id: p.id, nome: p.nome, whatsapp: p.whatsapp, email: p.email, slot_inicio: chave,
      slot_rotulo: t('slot_rotulo', 80), regiao: t('regiao', 30), objetivo: t('objetivo', 30), dor: t('dor', 300), tempo: t('tempo', 40), tentativas: t('tentativas', 80), prazo: t('prazo', 60),
      status: 'pre_reserva', termo: 'pendente', pix: 'pendente', expira_em: expira.toISOString() });
    var resumo = 'PRÉ-RESERVA pela landing (e-mail confirmado por código)\nNome: ' + p.nome + '\nWhatsApp: ' + p.whatsapp + '\nE-mail: ' + p.email +
      '\nNascimento: ' + (p.nascimento || '—') + ' · Cidade: ' + (p.cidade || '—') + ' · Como conheceu: ' + (p.como_conheceu || '—') +
      '\nRegião: ' + (r.regiao || '—') + ' · Objetivo: ' + (r.objetivo || '—') + '\nO que incomoda: ' + (r.dor || '—') + '\nHá quanto tempo: ' + (r.tempo || '—') +
      ' · Já tentou: ' + (r.tentativas || '—') + ' · Prazo: ' + (r.prazo || '—') + '\nPendências: Termo da reserva + Pix R$ 300 identificado na conta (conferência pela equipe: ' + cfg.base_url + '/ferramentas/#equipe).';
    try {
      var ag = agenda_(cfg), ev = ag.createEvent('PRÉ-RESERVA · Avaliação Endolaser · ' + p.nome, ini, fim, { description: resumo });
      try { ev.setColor(CalendarApp.EventColor.YELLOW); } catch (e) { }
      r.evento_id = ev.getId(); db.salvar('Reservas', r);
    } catch (e) { r.observacao = 'agenda: ' + String(e).slice(0, 120); db.salvar('Reservas', r); }
    email_(db, cfg, cfg.aviso_email, 'Nova pré-reserva Endolaser: ' + p.nome + ' · ' + r.slot_rotulo, 'Nova pré-reserva pela landing',
      '<pre style="font:15px/1.5 Arial;white-space:pre-wrap">' + esc_(resumo) + '</pre>' + botao_('https://wa.me/' + p.whatsapp, 'Abrir WhatsApp da pessoa'), resumo, 'equipe');
    return { ok: true, slot_ok: true, reserva: r.id, expira_em: r.expira_em, termo: { versao: cfg.termo_versao, url: cfg.base_url + '/endolaser/docs/termo-reserva-avaliacao-endolaser.pdf' } };
  },
  // {sessao, reserva, cpf, aceite: true}
  termo: function (db, cfg, b) {
    var s = sessaoValida_(db, b.sessao); if (!s) return { ok: false, erro: 'sessao' };
    var r = db.um('Reservas', 'id', b.reserva || '-'); if (!r || r.pessoa_id !== s.pessoa_id) return { ok: false, erro: 'reserva' };
    if (b.aceite !== true) return { ok: false, erro: 'aceite' };
    if (!cpfOk_(b.cpf)) return { ok: false, erro: 'cpf' };
    if (r.termo === 'aceito') return { ok: true, termo_ok: true };
    var p = db.um('Pessoas', 'id', s.pessoa_id), cpf = String(b.cpf).replace(/\D/g, ''), quando = agoraIso_();
    var texto = TERMO.map(function (c) { return c[0] + '\n' + c[1]; }).join('\n\n');
    var hash = sha_([texto, p.nome, cpf, p.nascimento, p.whatsapp, p.email, r.slot_inicio, quando, cfg.termo_versao].join('|'));
    r.termo = 'aceito'; r.termo_em = quando; r.termo_versao = cfg.termo_versao; r.termo_hash = hash; r.cpf = cpf; db.salvar('Reservas', r);
    p.cpf = cpf; db.salvar('Pessoas', p);
    var cpfM = cpf.slice(0, 3) + '.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-' + cpf.slice(9);
    var html = '<html><body style="font:12pt/1.45 Arial;color:#1B1A18;margin:24px"><div style="border-bottom:2px solid #C9A24B;padding-bottom:8px;margin-bottom:12px;font:600 10pt Arial;letter-spacing:.15em;color:#7A5F1E">INSTITUTO COUTO DE MEDICINA AVANÇADA · TERMO DA RESERVA DE HORÁRIO</div>' +
      '<h1 style="font:600 20pt Georgia">Termo de Consentimento e de Reserva de Horário</h1><p style="color:#7A5F1E;margin-top:-8px">Avaliação médica para Endolaser · versão ' + esc_(cfg.termo_versao) + '</p>' +
      TERMO.map(function (c) { return '<p><b>' + esc_(c[0]) + '</b><br>' + esc_(c[1]) + '</p>'; }).join('') +
      '<div style="border:1px solid #E6DDC8;background:#FAF7F0;padding:10px 14px;margin-top:14px"><b>Paciente:</b> ' + esc_(p.nome) + ' · CPF ' + cpfM + ' · nascimento ' + esc_(p.nascimento || '—') +
      '<br><b>Contato:</b> WhatsApp +' + esc_(p.whatsapp) + ' · ' + esc_(p.email) + '<br><b>Horário escolhido:</b> ' + esc_(r.slot_rotulo) +
      '<br><b>Aceite eletrônico:</b> e-mail confirmado por código em ' + fmtSP_(new Date(p.validado_em), 'dd/MM/yyyy HH:mm') + ' · termo aceito em ' + fmtSP_(new Date(quando), 'dd/MM/yyyy HH:mm') + ' (horário de Brasília)' +
      '<br><b>Resumo criptográfico (SHA-256):</b> <span style="font:9pt monospace">' + hash + '</span></div></body></html>';
    var pdf = null;
    try { pdf = Utilities.newBlob(html, 'text/html', 'termo.html').getAs('application/pdf').setName('Termo da reserva · ' + p.nome + ' · ' + r.slot_inicio.slice(0, 10) + '.pdf'); } catch (e) { }
    if (pdf) { try { var f = pasta_().createFile(pdf); r.termo_pdf = f.getUrl(); db.salvar('Reservas', r); } catch (e) { } }
    var aula = cfg.aula_agendamento ? '<p>Enquanto isso, assista à aula completa do Dr. Couto sobre Endolaser:</p>' + botao_(linkUrl_(cfg, p.id, 'aula-agendamento', 30), 'Assistir à aula') : '';
    email_(db, cfg, p.email, 'Pré-reserva recebida: ' + r.slot_rotulo, primeiro_(p.nome) + ', sua pré-reserva foi recebida',
      '<p>Horário escolhido: <b>' + esc_(r.slot_rotulo) + '</b>, avaliação de cerca de 30 minutos com o Dr. José M Couto.</p><p>O Termo da reserva foi aceito; a cópia segue em anexo.</p>' +
      '<p><b>Falta só um passo:</b> a reserva de horário de R$ ' + cfg.reserva_valor + ',00 via Pix.</p><p style="background:#FAF7F0;border:1px solid #E6DDC8;padding:12px 14px">Chave Pix (CNPJ): <b>35.000.039/0001-93</b><br>JMCJ Serviços e Soluções em Saúde Ltda.<br>Valor: <b>R$ ' + cfg.reserva_valor + ',00</b></p>' +
      '<p>Depois de pagar, envie o comprovante pelo WhatsApp oficial. O horário fica confirmado quando o pagamento é identificado na conta do Instituto, e você recebe a confirmação por e-mail. O Instituto não envia link de pagamento.</p>' +
      botao_('https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent('Olá! Fiz a pré-reserva pela página para ' + r.slot_rotulo + ' (' + p.nome + '). Segue o comprovante do Pix.'), 'Enviar comprovante pelo WhatsApp') +
      botao_(cfg.base_url + '/endolaser/docs/como-se-preparar-avaliacao-endolaser.pdf', 'Como se preparar') + aula,
      'Pré-reserva recebida. Termo aceito (cópia em anexo). Falta a reserva de horário de R$ ' + cfg.reserva_valor + ',00 via Pix para a chave CNPJ 35.000.039/0001-93 (JMCJ Serviços e Soluções em Saúde Ltda.). Depois de pagar, envie o comprovante pelo WhatsApp ' + cfg.whatsapp_exibicao + '.', 'reserva', pdf);
    try { if (r.evento_id) { var ev = agenda_(cfg).getEventById(r.evento_id); if (ev) ev.setDescription(ev.getDescription().replace('Pendências: Termo da reserva + ', 'Termo aceito em ' + fmtSP_(new Date(quando), 'dd/MM HH:mm') + ' · Pendência: ')); } } catch (e) { }
    return { ok: true, termo_ok: true };
  },
  // {k}: abre um link mascarado. PDF volta em base64 (o arquivo no Drive pode ficar privado); vídeo volta como endereço de incorporação.
  link_abrir: function (db, cfg, b) {
    if (!limite_('lnk:' + String(b.k || '').slice(0, 60), 30, 3600)) return { ok: false, erro: 'limite' };
    var c = linkChecar_(db, cfg, b.k), t = c.t || { p: '', m: '', id: '' };
    db.inserir('Acessos', { quando: agoraIso_(), pessoa_id: t.p, material: t.m, resultado: c.motivo, link_id: t.id });
    if (!c.valido) return { ok: false, erro: c.motivo, titulo: c.m ? c.m.titulo : '' };
    var u = c.m.url, yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(u), id = driveId_(u);
    if (yt) return { ok: true, tipo: 'video', titulo: c.m.titulo, embed: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?rel=0&modestbranding=1' };
    if (id) {
      var f = DriveApp.getFileById(id), mime = f.getMimeType();
      if (/^video\//.test(mime)) return { ok: true, tipo: 'video', titulo: c.m.titulo, embed: 'https://drive.google.com/file/d/' + id + '/preview' };
      return { ok: true, tipo: 'pdf', titulo: c.m.titulo, nome: c.m.titulo.replace(/[^\wÀ-ú -]/g, '').trim() + '.pdf', dados: Utilities.base64Encode(f.getBlob().getBytes()) };
    }
    return { ok: true, tipo: 'externo', titulo: c.m.titulo, url: u };
  },
  // conferência humana do Pix: {chave_equipe, op: 'pendentes'|'confirmar'|'cancelar', reserva}
  equipe: function (db, cfg, b) {
    var k = String(b.chave_equipe || ''); if (!k || (k !== chaveEquipe_() && k !== ADMIN_CHAVE)) return { ok: false, erro: 'acesso' };
    if (b.op === 'confirmar' || b.op === 'cancelar') {
      var r = db.um('Reservas', 'id', b.reserva || '-'); if (!r) return { ok: false, erro: 'reserva' };
      if (r.status !== 'pre_reserva') return { ok: false, erro: 'status', status: r.status };
      if (b.op === 'confirmar') { if (r.termo !== 'aceito') return { ok: false, erro: 'termo' };
        r.pix = 'pago'; r.observacao = ('Pix conferido pela equipe em ' + fmtSP_(new Date(), 'dd/MM HH:mm') + '. ' + (r.observacao || '')).slice(0, 300); confirmar_(db, cfg, r); }
      else { r.status = 'cancelada'; r.observacao = ('Cancelada pela equipe em ' + fmtSP_(new Date(), 'dd/MM HH:mm') + '. ' + (r.observacao || '')).slice(0, 300); db.salvar('Reservas', r);
        try { var ev = agenda_(cfg).getEventById(r.evento_id); if (ev && /^PRÉ-RESERVA/.test(ev.getTitle())) ev.deleteEvent(); } catch (e) { } }
      return { ok: true, reserva: r.id, status: r.status };
    }
    var lista = db.todos('Reservas').filter(function (r) { return r.status === 'pre_reserva' || (r.status === 'confirmada' && r.slot_inicio >= fmtSP_(new Date(), 'yyyy-MM-dd')); })
      .map(function (r) { return { id: r.id, nome: r.nome, whatsapp: r.whatsapp, email: r.email, horario: r.slot_rotulo, slot: r.slot_inicio, regiao: r.regiao, termo: r.termo, pix: r.pix, status: r.status, criado_em: r.criado_em, expira_em: r.expira_em }; })
      .sort(function (x, y) { return x.slot < y.slot ? -1 : 1; });
    return { ok: true, reservas: lista, valor: cfg.reserva_valor };
  },
  integracao: function (db, cfg, b) {   // exportação só leitura para o HÓRUS (pg_cron + pg_net); sem linhas de teste
    if (!INTEGRACAO_CHAVE || b.chave !== INTEGRACAO_CHAVE) return { ok: false, erro: 'acesso' };
    var desde = Date.parse(b.desde || '') || 0, recente = Date.now() - 2 * 864e5;
    var teste = function (x) { return /\+(landing|teste)/i.test(x.email || '') || /^55129900000/.test(x.whatsapp || ''); };
    var quando = function (t) { var n = Date.parse(t || ''); return isNaN(n) ? 0 : n; };
    var slot = function (k) { try { return /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(k || '') ? dataSP_(k).getTime() : 0; } catch (e) { return 0; } };
    var campos = function (o, lista) { var r = {}; lista.forEach(function (k) { r[k] = o[k] || ''; }); return r; };
    var pessoas = db.todos('Pessoas').filter(function (p) { return !teste(p) && (quando(p.criado_em) > desde || quando(p.validado_em) > desde); })
      .map(function (p) { return campos(p, ['id', 'criado_em', 'nome', 'whatsapp', 'email', 'nascimento', 'cidade', 'como_conheceu', 'cpf', 'consent_em', 'consent_versao', 'origem', 'validado_em', 'indicacao_id', 'tipo']); });
    var reservas = db.todos('Reservas').filter(function (r) { return !teste(r) && (quando(r.criado_em) > desde || quando(r.termo_em) > desde || slot(r.slot_inicio) >= recente); })
      .map(function (r) { return campos(r, ['id', 'criado_em', 'pessoa_id', 'nome', 'whatsapp', 'email', 'slot_inicio', 'slot_rotulo', 'regiao', 'objetivo', 'dor', 'tempo', 'tentativas', 'prazo', 'status', 'termo', 'termo_em', 'termo_versao', 'termo_pdf', 'cpf', 'pix', 'expira_em', 'observacao']); });
    return { ok: true, versao: VERSAO, agora: agoraIso_(), pessoas: pessoas, reservas: reservas };
  },
  admin: function (db, cfg, b) {
    if (b.chave !== ADMIN_CHAVE) return { ok: false, erro: 'acesso' };
    var pr = PropertiesService.getScriptProperties();
    if (b.link_criar) {   // {material, pessoa?: e-mail | id | '*', dias?}
      var alvo = String(b.pessoa || '*').trim().toLowerCase(), pid = '*';
      if (alvo !== '*') { var px = db.um('Pessoas', 'email', alvo) || db.um('Pessoas', 'id', alvo); if (!px) return { ok: false, erro: 'pessoa' }; pid = px.id; }
      if (!material_(cfg, b.material)) return { ok: false, erro: 'material' };
      var lk = linkUrl_(cfg, pid, b.material, b.dias || (pid === '*' ? 30 : 365));
      return { ok: true, link: lk, diagnostico: (function (d) { return { valido: d.valido, motivo: d.motivo }; })(linkChecar_(db, cfg, lk.split('k=')[1])) };
    }
    if (b.link_status || b.link_revogar) {
      var kk = String(b.link_status || b.link_revogar).replace(/^.*[?&]k=/, ''), d = linkChecar_(db, cfg, kk);
      if (!d.t) return { ok: true, valido: false, motivo: 'assinatura' };
      if (b.link_revogar) { var rv = revogados_(); if (rv.indexOf(d.t.id) < 0) rv.push(d.t.id); pr.setProperty('LINKS_REVOGADOS', JSON.stringify(rv.slice(-800))); d = linkChecar_(db, cfg, kk); }
      var ac = db.todos('Acessos').filter(function (x) { return x.link_id === d.t.id; });
      return { ok: true, valido: d.valido, motivo: d.motivo, material: d.m ? d.m.titulo : d.t.m, pessoa: d.p ? primeiro_(d.p.nome) + ' · ' + mascara_(d.p.email) : (d.t.p === '*' ? 'link livre' : 'não encontrada'),
        expira: fmtSP_(new Date(d.t.e * 1000), 'dd/MM/yyyy'), acessos: ac.length, ultimos: ac.slice(-5).map(function (x) { return fmtSP_(new Date(x.quando), 'dd/MM HH:mm') + ' · ' + x.resultado; }) };
    }
    if (b.materiais_privados) {   // tira o "qualquer pessoa com o link" dos PDFs e da pasta deles; o script (dono) continua lendo
      var feitos = [], pastas = {};
      (cfg.materiais || []).forEach(function (m) { var id = driveId_(m.url); if (!id) return;
        try { var f = DriveApp.getFileById(id); privado_(f); feitos.push(m.id);
          var it = f.getParents(); while (it.hasNext()) { var pa = it.next(); pastas[pa.getId()] = pa; } } catch (e) { feitos.push(m.id + ': ' + String(e).slice(0, 90)); } });
      Object.keys(pastas).forEach(function (k) { try { privado_(pastas[k]); } catch (e) { feitos.push('pasta: ' + String(e).slice(0, 90)); } });
      return { ok: true, privados: feitos, pastas: Object.keys(pastas).length };
    }
    if (b.equipe_chave) { var ce = chaveEquipe_(); if (!ce || b.equipe_chave === 'nova') { ce = hex_(24); pr.setProperty('EQUIPE_CHAVE', ce); } return { ok: true, chave_equipe: ce }; }
    if (b.ultimo_codigo) {   // só para e-mails de teste (+teste/+landing): usado pela bateria de testes ao vivo
      var em = String(b.ultimo_codigo).toLowerCase(); if (!/\+(landing|teste)/.test(em)) return { ok: false, erro: 'so_teste' };
      var ult = db.todos('Emails').filter(function (x) { return x.para === em && x.finalidade === 'codigo'; }).pop();
      return { ok: true, codigo: ult ? (/(\d{6})/.exec(ult.assunto) || [])[1] || '' : '' };
    }
    if (b.apontar_arquivo) {   // troca o arquivo de código no Drive (atualização e reversão sem reimplantar)
      try { var f = DriveApp.getFileById(String(b.apontar_arquivo)); if (!/^landing-endolaser-backend/.test(f.getName())) return { ok: false, erro: 'arquivo' };
        PropertiesService.getScriptProperties().setProperty('ARQ', f.getId()); try { CacheService.getScriptCache().remove('codigo:' + ARQ); } catch (e) { }
        return { ok: true, arquivo: f.getName(), anterior: ARQ }; } catch (e) { return { ok: false, erro: String(e).slice(0, 200) }; }
    }
    if (b.resumo_equipe) return { ok: true, enviado: resumoEquipe_(db, cfg, true) };
    if (b.placar) return placar_(db, cfg, Math.min(90, Math.max(1, +b.placar || 7)));
    if (b.placar_enviar) return { ok: true, enviado: placarSemanal_(db, cfg, true) };
    if (b.recarregar) { try { CacheService.getScriptCache().remove('codigo:' + ARQ); } catch (e) { } return { ok: true, recarregado: true }; }
    if (b.testar_pasta) { try { return { ok: true, pasta: pasta_().getUrl() }; } catch (e) { return { ok: false, erro: String(e).slice(0, 200) }; } }
    if (b.limpar_teste) {   // apaga só linhas de teste: e-mail com +landing/+teste ou WhatsApp 55129900000xx
      var teste = function (x) { return /\+(landing|teste)/i.test(x.email || x.para || x.email_destino || '') || /^55129900000/.test(x.whatsapp || ''); };
      var ids = {}; db.todos('Pessoas').forEach(function (x) { if (teste(x)) ids[x.id] = 1; });
      var apagados = {};
      ['Pessoas', 'Sessoes', 'Indicacoes', 'Reservas', 'Emails', 'Acessos'].forEach(function (t) {
        var tb = db.tab(t), alvo = tb.rows.filter(function (x) { return teste(x) || ids[x.pessoa_id] || ids[x.indicador_id]; });
        alvo.forEach(function (x) {
          if (t === 'Reservas') { try { if (x.evento_id) { var ev = agenda_(cfg).getEventById(x.evento_id); if (ev) ev.deleteEvent(); } } catch (e) { }
            try { var m = /\/d\/([^/]+)/.exec(x.termo_pdf || ''); if (m) DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { } }
        });
        alvo.map(function (x) { return x._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { tb.sh.deleteRow(r); });
        apagados[t] = alvo.length; delete db.t[t];
      });
      return { ok: true, apagados: apagados };
    }
    if (b.config) { var sh = db.ss.getSheetByName('Config'); Object.keys(b.config).forEach(function (k) { var row = db.um('Config', 'chave', k), v = typeof b.config[k] === 'string' ? b.config[k] : JSON.stringify(b.config[k]);
      if (row) { row.valor = v; db.salvar('Config', row); } else db.inserir('Config', { chave: k, valor: v, descricao: '' }); }); }
    var c = function (t, f) { return db.todos(t).filter(f || function () { return true; }).length; };
    return { ok: true, versao: VERSAO, planilha: db.ss.getUrl(), cota_email: MailApp.getRemainingDailyQuota(), pessoas: c('Pessoas'),
      confirmadas: c('Pessoas', function (x) { return x.validado_em; }), indicacoes_validas: c('Indicacoes', function (x) { return x.status === 'validado'; }),
      reservas: c('Reservas'), emails_pendentes: c('Emails', function (x) { return x.status === 'pendente'; }), gatilhos: ScriptApp.getProjectTriggers().length,
      acessos: c('Acessos'), eventos: c('Eventos'), catalogo: (cfg.materiais || []).map(function (m) { return { id: m.id, titulo: m.titulo }; }).concat((cfg.aulas || []).map(function (a) { return { id: a.id, titulo: 'Aula · ' + a.titulo, gravada: !!a.url }; })) };
  }
};

// ------------------------------------------------------------------------------------------------- agenda (regra sequencial do Dr. Couto)
function agenda_(cfg) { return cfg.calendar_id ? CalendarApp.getCalendarById(cfg.calendar_id) : CalendarApp.getDefaultCalendar(); }
function pasta_() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty('PASTA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var f = DriveApp.createFolder('Instituto Couto · Termos aceitos (landing)'); pr.setProperty('PASTA_ID', f.getId()); return f;
}
function ocupacao_(db, cfg, de, ate) {
  var out = [];
  try {
    agenda_(cfg).getEvents(de, ate).forEach(function (e) { if (!e.isAllDayEvent()) out.push({ inicio: fmtSP_(e.getStartTime(), 'yyyy-MM-dd HH:mm'), fim: fmtSP_(e.getEndTime(), 'yyyy-MM-dd HH:mm') }); });
  } catch (e) { }
  db.todos('Reservas').forEach(function (r) {
    if (r.status !== 'pre_reserva' && r.status !== 'confirmada') return;
    var i = dataSP_(r.slot_inicio); out.push({ inicio: r.slot_inicio, fim: fmtSP_(new Date(i.getTime() + cfg.agenda.avaliacao_minutos * 60e3), 'yyyy-MM-dd HH:mm') });
  });
  return out;
}
var toMin_ = function (s) { return +s.slice(0, 2) * 60 + +s.slice(3, 5); };
var hhmm_ = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };
var DIAS_ = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
// Mesma regra do motor da página: turno vazio começa no primeiro horário; com atendimento, o próximo encosta no último (sem lacuna).
function iniciosValidos_(dataISO, turno, a, ocup, minimo) {
  var passo = a.avaliacao_minutos, oc = [];
  ocup.forEach(function (o) {
    if (String(o.inicio).slice(0, 10) !== dataISO && String(o.fim).slice(0, 10) !== dataISO) return;
    var ini = String(o.inicio).slice(0, 10) === dataISO ? toMin_(String(o.inicio).slice(11)) : 0, fim = String(o.fim).slice(0, 10) === dataISO ? toMin_(String(o.fim).slice(11)) : 1440;
    oc.push([ini, fim]);
  });
  var noTurno = oc.filter(function (x) { return x[0] >= turno.ini && x[0] < turno.lim; });
  var fimUlt = noTurno.length ? Math.max.apply(null, noTurno.map(function (x) { return x[1]; })) : null, out = [];
  for (var m = turno.ini; m <= turno.fim; m += passo) {
    if (m < minimo) continue;
    if (oc.some(function (x) { return m < x[1] && m + passo > x[0]; })) continue;
    if (fimUlt === null ? m !== turno.ini : m > fimUlt) continue;
    out.push(m);
  }
  return out;
}
// Dois horários, manhãs primeiro (um por dia), só depois a tarde; em ordem cronológica. Com 'dia', devolve todos os válidos daquele dia.
function horarios_(db, cfg, dia) {
  var a = cfg.agenda, ag = agoraSP_(), base = new Date(Date.UTC(ag.y, ag.m - 1, ag.d));
  var ocup = ocupacao_(db, cfg, new Date(Date.now() - 864e5), new Date(Date.now() + (a.janela_dias + 2) * 864e5));
  var turnos = [{ ini: toMin_(a.manha_inicio), fim: toMin_(a.manha_ultimo_inicio), lim: toMin_(a.tarde_inicio) },
                { ini: toMin_(a.tarde_inicio), fim: toMin_(a.tarde_fim) - a.avaliacao_minutos, lim: 1440 }];
  var rot = function (dt, m) { return DIAS_[dt.getUTCDay()] + ', ' + ('0' + dt.getUTCDate()).slice(-2) + '/' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + ', às ' + hhmm_(m); };
  var out = [];
  for (var t = 0; t < 2; t++) {
    for (var off = 0; off <= a.janela_dias && (dia || out.length < 2); off++) {
      var dt = new Date(base.getTime() + off * 864e5), iso = dt.toISOString().slice(0, 10);
      if (dia && iso !== dia) continue;
      if (a.dias_avaliacao.indexOf(dt.getUTCDay()) < 0) continue;
      var ok = iniciosValidos_(iso, turnos[t], a, ocup, off === 0 ? ag.h * 60 + ag.min + a.antecedencia_min : -1);
      (dia ? ok : ok.slice(0, 1)).forEach(function (m) { out.push({ chave: iso + ' ' + hhmm_(m), rotulo: rot(dt, m) }); });
    }
    if (!dia && out.length >= 2) break;
  }
  return (dia ? out : out.slice(0, 2)).sort(function (x, y) { return x.chave < y.chave ? -1 : 1; });
}

function confirmar_(db, cfg, r) {
  r.status = 'confirmada'; db.salvar('Reservas', r);
  try { var ev = agenda_(cfg).getEventById(r.evento_id); if (ev) { ev.setTitle('CONFIRMADO · Avaliação Endolaser · ' + r.nome); try { ev.setColor(CalendarApp.EventColor.GREEN); } catch (e) { } } } catch (e) { }
  email_(db, cfg, r.email, 'Horário confirmado: ' + r.slot_rotulo, primeiro_(r.nome) + ', seu horário está confirmado',
    '<p>Recebemos a reserva de horário. A sua avaliação com o Dr. José M Couto está confirmada para <b>' + esc_(r.slot_rotulo) + '</b>.</p><p>Endereço: Av. São João, 2375, sala 902, Ed. Helbor Offices, Jardim das Colinas, São José dos Campos/SP. Chegue 10 minutos antes.</p>' +
    botao_(cfg.base_url + '/endolaser/docs/como-se-preparar-avaliacao-endolaser.pdf', 'Como se preparar'), 'Horário confirmado: ' + r.slot_rotulo, 'confirmacao');
}
// tira o acesso por link; algumas contas recusam Permission.NONE, então tenta VIEW (com PRIVATE o efeito é o mesmo: só quem foi convidado)
function privado_(f) { try { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); } }
function chaveEquipe_() { return PropertiesService.getScriptProperties().getProperty('EQUIPE_CHAVE') || ''; }

// ------------------------------------------------------------------------------------------------- tarefas periódicas (a cada 10 min)
function tarefas_() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    var db = new Store_(), cfg = cfg_(db), agora = Date.now();
    db.todos('Reservas').forEach(function (r) {
      if (r.status === 'pre_reserva' && r.pix === 'pago' && r.termo === 'aceito') confirmar_(db, cfg, r);
      else if (r.status === 'pre_reserva' && r.pix !== 'pago' && r.expira_em && Date.parse(r.expira_em) < agora) {
        r.status = 'expirada'; db.salvar('Reservas', r);
        try { var e2 = agenda_(cfg).getEventById(r.evento_id); if (e2 && /^PRÉ-RESERVA/.test(e2.getTitle())) e2.deleteEvent(); } catch (e) { }
      }
    });
    var fila = db.todos('Emails').filter(function (x) { return x.status === 'pendente' && x.html; })
      .sort(function (a, b) { return (ORDEM_[a.finalidade] || 2) - (ORDEM_[b.finalidade] || 2) || (a.criado_em < b.criado_em ? -1 : 1); }).slice(0, 40);
    fila.forEach(function (x) {
      if (MailApp.getRemainingDailyQuota() < 1) return;
      var b = bloqueioCadencia_(db, cfg, x.para, x.assunto, x.finalidade);
      if (b === 'duplicado') { x.status = 'duplicado'; x.html = ''; db.salvar('Emails', x); return; }
      if (b) { x.erro = b; db.salvar('Emails', x); return; }
      try { MailApp.sendEmail(x.para, x.assunto, x.texto, { htmlBody: x.html, name: cfg.remetente }); x.status = 'enviado'; x.enviado_em = agoraIso_(); x.html = ''; x.erro = ''; }
      catch (e) { var n = +((/^\[(\d+)\]/.exec(x.erro || '') || [])[1] || 0) + 1; x.erro = '[' + n + '] ' + String(e).slice(0, 180); if (n >= 6) x.status = 'erro'; }
      db.salvar('Emails', x);
    });
    resumoEquipe_(db, cfg, false);
    placarSemanal_(db, cfg, false);
    try { podarPerguntas_(); } catch (e) { }
  } finally { lock.releaseLock(); }
}
function instalarGatilhos_() {
  var pr = PropertiesService.getScriptProperties(); if (pr.getProperty('GATILHOS') === VERSAO) return;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tarefasPeriodicas') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tarefasPeriodicas').timeBased().everyMinutes(10).create();
  pr.setProperty('GATILHOS', VERSAO);
}

// ------------------------------------------------------------------------------------------------- medição (v1.5.0): visitas e etapas, sem nome, e-mail ou telefone
var EV_TIPOS = { visita: 1, estado: 1, chat_aberto: 1, cta: 1, whatsapp: 1, email_confirmado: 1, indicacao: 1, pre_reserva: 1 };
function limpo_(x, n) { return String(x == null ? '' : x).replace(/[^\w\u00C0-\u00FF .:+\/-]/g, '').slice(0, n || 40); }
function evento_(b) {   // caminho rápido: sem trava global e sem ler a planilha inteira
  var s = String(b.s || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  if (s.length < 8 || !EV_TIPOS[b.tipo]) return { ok: false, erro: 'evento' };
  if (!limite_('ev:' + s, 80, 3600)) return { ok: false, erro: 'limite' };
  var ss = planilha_(), h = TABELAS.Eventos, sh = ss.getSheetByName('Eventos');
  if (!sh) { sh = ss.insertSheet('Eventos'); sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0E0D0C').setFontColor('#E2C27A'); sh.setFrozenRows(1); }
  sh.appendRow([agoraIso_(), sha_(s).slice(0, 12), limpo_(b.tipo, 20), limpo_(b.estado, 24), limpo_(b.canal), limpo_(b.formato), limpo_(b.conteudo, 60), limpo_(b.campanha), limpo_(b.variante, 20), limpo_(b.dispositivo, 10)]);
  return { ok: true };
}
// ------------------------------------------------------------------------------------------------- treino do chat (v1.6.0)
// O chat envia só o texto da pergunta que não soube responder (ou que esclareceu com botões). Telefone, e-mail, CPF e números longos
// são apagados aqui também (defesa dupla). Sem nome, sem contato: a linha não identifica a pessoa. Linhas com mais de 90 dias são apagadas.
var PG_MODOS = { desconhecida: 1, esclarecida: 1, bloqueada: 1 };
function semDados_(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '(e-mail)')
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '(cpf)')
    .replace(/(\+?\d[\d ()\-.]{6,}\d)/g, '(número)')
    .replace(/\s{2,}/g, ' ').trim().slice(0, 280);
}
function pergunta_(b) {
  var s = String(b.s || '').replace(/[^a-z0-9]/gi, '').slice(0, 32), texto = semDados_(b.texto);
  if (s.length < 8 || !PG_MODOS[b.modo] || texto.length < 2) return { ok: false, erro: 'pergunta' };
  if (!limite_('pg:' + s, 20, 3600) || !limite_('pg:dia', 400, 86400)) return { ok: false, erro: 'limite' };
  var ss = planilha_(), h = TABELAS.Perguntas, sh = ss.getSheetByName('Perguntas');
  if (!sh) { sh = ss.insertSheet('Perguntas'); sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0E0D0C').setFontColor('#E2C27A'); sh.setFrozenRows(1); }
  sh.appendRow([agoraIso_(), sha_(s).slice(0, 12), b.modo, texto, limpo_(b.intent, 30), limpo_(b.estado, 24), limpo_(b.canal), limpo_(b.variante, 20), 'nova', '', '']);
  return { ok: true };
}
function podarPerguntas_() {   // uma vez por dia: apaga perguntas com mais de 90 dias
  var pr = PropertiesService.getScriptProperties(), hoje = fmtSP_(new Date(), 'yyyy-MM-dd');
  if (pr.getProperty('PG_PODA') === hoje) return; pr.setProperty('PG_PODA', hoje);
  var sh = planilha_().getSheetByName('Perguntas'); if (!sh) return;
  var v = sh.getDataRange().getValues(), corte = Date.now() - 90 * 864e5;
  for (var i = v.length - 1; i >= 1; i--) { var q = Date.parse(v[i][0]); if (!isNaN(q) && q < corte) sh.deleteRow(i + 1); }
}
var ETAPAS_ = { horarios: ['horarios', 'combinar', 'dados', 'cadastro', 'validando', 'termo', 'reserva'], escolha: ['combinar', 'dados', 'cadastro', 'validando', 'termo', 'reserva'], dados: ['validando', 'termo', 'reserva'] };
function placar_(db, cfg, dias) {
  var desde = Date.now() - dias * 864e5, quando = function (t) { var n = Date.parse(t || ''); return isNaN(n) ? 0 : n; };
  var teste = function (x) { return /\+(landing|teste)/i.test(x.email || x.para || '') || /^55129900000/.test(x.whatsapp || ''); };
  var sess = {}, canais = {}, visitas = 0, mais = function (o, k) { o[k] = (o[k] || 0) + 1; };
  db.todos('Eventos').forEach(function (x) { if (quando(x.quando) < desde) return;
    var s = sess[x.sessao] || (sess[x.sessao] = { v: '', e: {} });
    if (x.tipo === 'visita') { visitas++; mais(canais, x.canal || 'direto'); }
    if (x.tipo === 'estado' && x.estado) s.e[x.estado] = 1;
    if (x.variante) s.v = x.variante; });
  var tem = function (s, lista) { return lista.some(function (k) { return s.e[k]; }); };
  var et = { conversas: 0, horarios: 0, escolha: 0, dados: 0 }, vars = {};
  Object.keys(sess).forEach(function (k) { var s = sess[k], conv = Object.keys(s.e).length > 0, hor = tem(s, ETAPAS_.horarios);
    if (conv) et.conversas++; if (hor) et.horarios++; if (tem(s, ETAPAS_.escolha)) et.escolha++; if (tem(s, ETAPAS_.dados)) et.dados++;
    if (s.v && conv) { var v = vars[s.v] || (vars[s.v] = { conversas: 0, horarios: 0 }); v.conversas++; if (hor) v.horarios++; } });
  var res = db.todos('Reservas').filter(function (r) { return quando(r.criado_em) >= desde && !teste(r); });
  var pix = res.filter(function (r) { return r.pix === 'pago' || r.status === 'confirmada'; }).length;
  var pg = { desconhecidas: 0, esclarecidas: 0 }; try { db.todos('Perguntas').forEach(function (x) { if (quando(x.quando) < desde) return; if (x.modo === 'esclarecida') pg.esclarecidas++; else pg.desconhecidas++; }); } catch (e) { }
  var em = {}; db.todos('Emails').forEach(function (x) { if (quando(x.criado_em) >= desde && !teste(x)) mais(em, x.status || 'pendente'); });
  return { ok: true, dias: dias, de: fmtSP_(new Date(desde), 'dd/MM'), ate: fmtSP_(new Date(), 'dd/MM'), visitas: visitas, canais: canais, sessoes: Object.keys(sess).length,
    conversas: et.conversas, chegaram_horarios: et.horarios, escolheram_horario: et.escolha, deixaram_dados: et.dados, pre_reservas: res.length, pix: pix,
    pessoas_novas: db.todos('Pessoas').filter(function (p) { return quando(p.criado_em) >= desde && !teste(p); }).length, emails: em, variantes: vars, perguntas: pg,
    metas_semana: { visitas: 400, conversas: 120, chegaram_horarios: 40, escolheram_horario: 20, pix: 10 } };
}
function placarTexto_(p) {
  var pc = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; }, f = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).map(function (k) { return k + ' ' + o[k]; }).join(', ') || 'sem dados'; };
  var v = Object.keys(p.variantes).sort().map(function (k) { var x = p.variantes[k]; return k + ': ' + x.conversas + ' conversas, ' + x.horarios + ' chegaram aos horários (' + pc(x.horarios, x.conversas) + ')'; });
  return ['Placar da landing Endolaser · ' + p.de + ' a ' + p.ate, '',
    'Visitas: ' + p.visitas + ' (meta 400) · por canal: ' + f(p.canais),
    'Conversas no chat: ' + p.conversas + ' (meta 120) · ' + pc(p.conversas, p.visitas) + ' das visitas',
    'Chegaram aos horários: ' + p.chegaram_horarios + ' (meta 40) · ' + pc(p.chegaram_horarios, p.conversas) + ' das conversas',
    'Escolheram um horário: ' + p.escolheram_horario + ' (meta 20)',
    'Pré-reservas: ' + p.pre_reservas + ' · Pix identificado: ' + p.pix + ' (meta 10)',
    'Pessoas novas: ' + p.pessoas_novas + ' · e-mails: ' + f(p.emails), '',
    'Teste da abertura: ' + (v.join(' · ') || 'sem dados ainda'), '',
    'Perguntas que o chat não soube responder: ' + ((p.perguntas || {}).desconhecidas || 0) + ' · esclarecidas com botões: ' + ((p.perguntas || {}).esclarecidas || 0) + ' (entram no treino diário)', '',
    'Leitura: duas semanas de dados antes de mexer num canal; teste com cerca de 160 conversas por versão.'].join('\n');
}
function placarSemanal_(db, cfg, forcar) {   // segunda-feira, a partir das 8h, uma vez por semana
  var a = agoraSP_(), seg = new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay() === 1, chave = a.y + '-' + a.m + '-' + a.d, pr = PropertiesService.getScriptProperties();
  if (!forcar && (!seg || a.h < 8 || pr.getProperty('PLACAR_SEMANA') === chave)) return false;
  var p = placar_(db, cfg, 7), t = placarTexto_(p);
  try { MailApp.sendEmail(cfg.aviso_email, 'Landing Endolaser · placar da semana ' + p.de + ' a ' + p.ate, t, { htmlBody: moldura_('Placar da semana', '<pre style="font:15px/1.5 Arial;white-space:pre-wrap">' + esc_(t) + '</pre>', cfg), name: cfg.remetente }); }
  catch (e) { return false; }
  if (!forcar) pr.setProperty('PLACAR_SEMANA', chave); return true;
}

// ------------------------------------------------------------------------------------------------- entrada do web app
function doPost_(e) {
  var b = {}; try { b = JSON.parse(e.postData.contents || '{}'); } catch (x) { return json_({ ok: false, erro: 'json' }); }
  if (b.acao === 'evento') { try { return json_(evento_(b)); } catch (x) { return json_({ ok: false, erro: 'evento' }); } }
  if (b.acao === 'pergunta') { try { return json_(pergunta_(b)); } catch (x) { return json_({ ok: false, erro: 'pergunta' }); } }
  var f = ACOES[b.acao]; if (!f) return json_({ ok: false, erro: 'acao' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json_({ ok: false, erro: 'ocupado' });
  try {
    try { instalarGatilhos_(); } catch (x) { }
    var db = new Store_(); return json_(f(db, cfg_(db), b));
  } catch (x) { console.error(x); return json_({ ok: false, erro: 'interno' }); }
  finally { lock.releaseLock(); }
}
function doGet_(e) {
  if (e && e.parameter && e.parameter.acao === 'horarios') { var db = new Store_(); return json_({ ok: true, slots: horarios_(db, cfg_(db)) }); }
  return json_({ ok: true, servico: 'landing-endolaser', versao: VERSAO });
}
// Rodar uma vez pelo editor (opcional, pelo 'configurar' do carregador): cria a planilha, a pasta e o gatilho, e mostra a cota de e-mail.
function configurar_() { var db = new Store_(); instalarGatilhos_(); pasta_(); console.log(db.ss.getUrl(), 'cota de e-mail hoje:', MailApp.getRemainingDailyQuota()); }
