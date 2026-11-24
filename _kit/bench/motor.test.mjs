import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { responder, novaConversa, aposValidar, aposTermo, proximosHorarios, classificar, violaNuncaEvento, linkWhats, normalizarWhats, validarEmail, validarNome } from "../motor/motor.mjs";

const kb = JSON.parse(readFileSync(new URL("../conhecimento/endolaser.json", import.meta.url)));
// quarta-feira 18/11/2026 10:00 (dow=3)
const agora = { y: 2026, m: 11, d: 18, h: 10, min: 0, dow: 3 };
const falar = async (conv, txt, ctx = {}) => responder(conv, txt, kb, { agora, ocupados: [], ...ctx });
const NEVER = kb.nunca_eventos;

test("validadores", () => {
  assert.equal(normalizarWhats("(12) 99184-3887"), "5512991843887");
  assert.equal(normalizarWhats("123"), null);
  assert.ok(validarEmail("a@b.com")); assert.ok(!validarEmail("a@b"));
  assert.ok(validarNome("Maria Silva")); assert.ok(!validarNome("Maria"));
});

test("agenda sequencial do HÓRUS: manhã vazia só começa às 08:00; manhãs primeiro; ordem cronológica", () => {
  const s = proximosHorarios(agora, kb.config, []);
  assert.equal(s.length, 2);
  // quarta 10:00: a manhã de hoje está vazia e já passou das 08:00 -> não oferece 11:00 (deixaria lacuna)
  assert.deepEqual(s.map((x) => x.chave), ["2026-11-18 14:00", "2026-11-19 08:00"]);
  // com atendimento até 09:30 hoje, o próximo da manhã é 09:30 (encosta no anterior)
  const s2 = proximosHorarios({ ...agora, h: 7 }, kb.config, [], [{ inicio: "2026-11-18 08:00", fim: "2026-11-18 09:30" }]);
  assert.deepEqual(s2.map((x) => x.chave), ["2026-11-18 09:30", "2026-11-19 08:00"]);
  // vão no meio da manhã é encaixado antes do fim
  const s3 = proximosHorarios({ ...agora, h: 7 }, kb.config, [], [{ inicio: "2026-11-18 08:00", fim: "2026-11-18 09:00" }, { inicio: "2026-11-18 09:30", fim: "2026-11-18 10:30" }]);
  assert.equal(s3[0].chave, "2026-11-18 09:00");
});

test("agenda: sexta/sábado nunca são oferecidos", () => {
  const sex = { y: 2026, m: 11, d: 20, h: 7, min: 0, dow: 5 }; // sexta
  const s = proximosHorarios(sex, kb.config, []);
  for (const x of s) assert.ok(!/sexta|sábado|domingo/.test(x.rotulo), x.rotulo);
  assert.match(s[0].chave, /^2026-11-23 08:00$/); // segunda (3 dias: sex+3=seg)
});

test("agenda: manhã esgotada passa para 14:00", () => {
  const ocup = [];
  for (const d of ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]) for (const h of ["08:00","08:30","09:00","09:30","10:00","10:30","11:00"]) ocup.push(`${d} ${h}`);
  const s = proximosHorarios({ ...agora, h: 7 }, kb.config, ocup);
  assert.match(s[0].chave, / 14:00$/);
});

test("urgência vence tudo e manda para 192", async () => {
  const r = await falar(novaConversa(), "estou com falta de ar depois do procedimento");
  assert.equal(r.acao, "urgencia"); assert.match(r.resposta, /192/);
});

test("pedido de pessoa → handoff", async () => {
  const r = await falar(novaConversa(), "quero falar com atendente");
  assert.equal(r.acao, "handoff");
});

test("pergunta clínica → humano, sem opinar", async () => {
  const r = await falar(novaConversa(), "tenho diabetes, posso fazer?");
  assert.equal(r.acao, "handoff"); assert.doesNotMatch(r.resposta, /pode fazer|não pode/i);
});

test("preço: 1º pedido não cita valor; sob insistência cita referência da região", async () => {
  let r = await falar(novaConversa(), "quanto custa?");
  assert.doesNotMatch(r.resposta, /R\$ ?\d\.\d{3}/);
  r = await falar(r.conv, "mas qual o valor, me diz");
  assert.match(r.resposta, /2\.900/); assert.match(r.resposta, /18\.200/);
  let c = novaConversa(); c.dados.regiao = "papada";
  r = await falar(c, "quanto custa?"); r = await falar(r.conv, "qual o valor mesmo?");
  assert.match(r.resposta, /papada: R\$ 3\.900/); assert.match(r.resposta, /definido por ele/);
});

test("preço: divulgar_faixa=false nunca cita valor", async () => {
  const kb2 = structuredClone(kb); kb2.config.divulgar_faixa = false;
  let r = await responder(novaConversa(), "quanto custa?", kb2, { agora });
  r = await responder(r.conv, "mas qual o valor", kb2, { agora });
  assert.doesNotMatch(r.resposta, /\d\.\d{3}/);
});

test("forma de pagamento e parcelamento vão ao humano, sem citar desconto", async () => {
  const r = await falar(novaConversa(), "aceita parcelar em 12x no cartão?");
  assert.equal(r.acao, "handoff"); assert.doesNotMatch(r.resposta, /desconto|10x|12x|5%/i);
});

test("10 objeções: respondem, sem prometer e terminando em passo seguro", async () => {
  const casos = ["mas sem aspirar sai mesmo a gordura?", "vai ficar flácido ou irregular?", "tenho medo de queimadura", "está muito caro", "vi mais barato em outra clínica", "quanto tempo para ver resultado? é definitivo?", "qual a diferença para a lipo?", "a gordura volta? preciso emagrecer antes?", "quanto tempo fico parada?", "preciso pensar e falar com meu marido"];
  const esperado = ["sem_aspirar","flacidez_irregular","queimadura","caro","comparacao","prazo","diferenca_lipo","gordura_volta","pos","pensar_conjuge"];
  for (let i = 0; i < casos.length; i++) {
    const c = classificar(casos[i], kb);
    assert.equal(c.intent?.id, esperado[i], casos[i] + " -> " + (c.intent?.id ?? c.tipo));
    const r = await falar(novaConversa(), casos[i]);
    assert.match(r.camada, /^L0/, casos[i]);
  }
});

test("MELA/mini lipo e injetáveis: encaminham sem citar preço", async () => {
  for (const t of ["vocês fazem mini lipo?", "quanto custa a vitamina D?", "faz exossomas?"]) {
    const r = await falar(novaConversa(), t);
    assert.equal(r.acao, "handoff", t); assert.doesNotMatch(r.resposta, /R\$ ?\d/, t);
  }
});

test("nenhum rascunho pendente: todos aprovados por delegação em 23/11 (v6.3.0)", () => {
  assert.equal(kb.intents.filter((i) => i.aprovacao === "rascunho").length, 0);
});

test("desconto/cortesia: recusa sem alavanca", async () => {
  const r = await falar(novaConversa(), "tem desconto ou cortesia?");
  assert.match(r.resposta, /Não trabalhamos com descontos/);
});

test("convênio: particular", async () => {
  const r = await falar(novaConversa(), "aceita unimed?");
  assert.match(r.resposta, /particulares/);
});

test("resultado: não promete", async () => {
  const r = await falar(novaConversa(), "quantos kg vou perder? funciona mesmo?");
  assert.match(r.resposta, /não é possível prometer/);
});

test("risco: reconhece risco inerente e valoriza competência", async () => {
  const r = await falar(novaConversa(), "tenho medo de queimadura, é perigoso?");
  assert.match(r.resposta, /risco inerente/); assert.match(r.resposta, /não uma garantia/); assert.equal(r.acao, null);
  const r2 = await falar(novaConversa(), "é perigoso? tem risco?");
  assert.match(r2.resposta, /riscos inerentes/);
});

test("jornada completa até reserva", async () => {
  let r = await falar(novaConversa(), "oi");
  assert.equal(r.conv.estado, "objetivo");
  r = await falar(r.conv, "quero reduzir gordura");
  assert.equal(r.conv.estado, "regiao");
  r = await falar(r.conv, "na barriga");
  assert.equal(r.conv.estado, "dor"); assert.equal(r.conv.dados.regiao, "abdome");
  r = await falar(r.conv, "tenho vergonha de usar biquíni e nada resolve");
  assert.equal(r.conv.estado, "tempo"); assert.match(r.conv.dados.dor, /biqu/);
  r = await falar(r.conv, "Mais de 2 anos"); assert.equal(r.conv.estado, "tentativas");
  r = await falar(r.conv, "Treino e alimentação"); assert.equal(r.conv.estado, "prazo");
  r = await falar(r.conv, "Sim, nos próximos 3 meses");
  assert.equal(r.conv.estado, "explicar"); assert.deepEqual([r.conv.dados.tempo, r.conv.dados.tentativas, r.conv.dados.prazo], ["Mais de 2 anos", "Treino e alimentação", "Sim, nos próximos 3 meses"]);
  r = await falar(r.conv, "sim, quero ver horário");
  assert.equal(r.conv.estado, "horarios"); assert.match(r.resposta, /1\).*\n2\)/s);
  r = await falar(r.conv, "quanto custa?");
  assert.equal(r.conv.estado, "horarios"); assert.match(r.resposta, /2\) /);
  r = await falar(r.conv, "2");
  assert.equal(r.conv.estado, "combinar"); for (const x of [/necessário reservar o seu horário/, /R\$ 300,00/, /35\.000\.039\/0001-93/, /TCLE/, /24 horas/, /identificado na conta/, /não é abatida/]) assert.match(r.resposta, x);
  assert.doesNotMatch(r.resposta, /LGPD|nome completo\?/);
  r = await falar(r.conv, "sim");
  assert.equal(r.conv.estado, "dados"); assert.match(r.resposta, /LGPD/);
  r = await falar(r.conv, "sim");
  assert.match(r.resposta, /nome completo/);
  r = await falar(r.conv, "Maria");
  assert.match(r.resposta, /nome e sobrenome/);
  r = await falar(r.conv, "Maria Souza");
  assert.match(r.resposta, /data de nascimento/);
  r = await falar(r.conv, "31/02/1990"); assert.match(r.resposta, /Não consegui ler/);
  r = await falar(r.conv, "10/04/1985"); assert.equal(r.conv.dados.nascimento, "1985-04-10");
  r = await falar(r.conv, "12 99184 3887");
  r = await falar(r.conv, "maria@exemplo.com"); assert.match(r.resposta, /cidade/);
  r = await falar(r.conv, "São José dos Campos"); assert.match(r.resposta, /como você conheceu/);
  r = await falar(r.conv, "Instagram");
  assert.equal(r.acao, "iniciar_agendamento"); assert.equal(r.conv.estado, "validando"); assert.match(r.resposta, /código de 6 dígitos/);
  assert.deepEqual([r.conv.dados.cidade, r.conv.dados.como_conheceu], ["São José dos Campos", "Instagram"]);
  assert.doesNotMatch(r.resposta, /35000039/);
  const espera = await falar(r.conv, "oi?? cadê"); assert.equal(espera.conv.estado, "validando"); assert.match(espera.resposta, /código/);
  let c2 = aposValidar(r.conv); assert.equal(c2.estado, "termo"); assert.equal(c2.dados.validado, true);
  const t2 = await falar(c2, "ok"); assert.match(t2.resposta, /Aceitar e concluir/);
  c2 = aposTermo(c2); assert.equal(c2.estado, "indicacao");
  const ind = await falar(c2, "sim"); assert.equal(ind.acao, "mostrar_indicacao");
  assert.match(linkWhats(r.conv, kb), /^https:\/\/wa\.me\/5512991843887\?text=/);
});

test("LGPD negada: não coleta dados", async () => {
  let r = await falar(await ateHorarios(), "1");
  r = await falar(r.conv, "sim"); assert.match(r.resposta, /LGPD/);
  r = await falar(r.conv, "não");
  assert.equal(r.conv.handoff, true); assert.equal(r.conv.dados.nome, undefined);
});

test("L1 só acionado quando L0 não resolve, com teto por conversa", async () => {
  let n = 0;
  const l1 = async () => { n++; return { reply: "O Dr. Couto explica tudo na avaliação.", handoff: false }; };
  let r = await falar(novaConversa(), "xyzzy blá", { l1, maxL1: 2 });
  assert.equal(r.camada, "L1");
  r = await falar(r.conv, "xyzzy blá", { l1, maxL1: 2 });
  r = await falar(r.conv, "xyzzy blá", { l1, maxL1: 2 });
  assert.equal(n, 2); assert.equal(r.acao, "handoff");
  r = await falar(novaConversa(), "o que é endolaser?", { l1 });
  assert.match(r.camada, /L0/);
});

test("porta de saída bloqueia resposta do L1 que viole nunca-eventos", async () => {
  const ruins = ["Você é candidata, garanto 100% de resultado!", "Última vaga, só hoje com desconto!", "Usamos laser de 1470 nm a 12 joules."];
  for (const m of ruins) {
    const l1 = async () => ({ reply: m, handoff: false });
    const r = await falar(novaConversa(), "zzz qqq", { l1 });
    assert.match(r.camada, /^bloqueio/, m); assert.equal(r.acao, "handoff");
  }
});

test("L1 que lança erro cai para humano", async () => {
  const r = await falar(novaConversa(), "zzz qqq", { l1: async () => { throw new Error("x"); } });
  assert.equal(r.acao, "handoff");
});

test("entrada hostil/longa não quebra", async () => {
  const r = await falar(novaConversa(), "a".repeat(5000));
  assert.equal(r.acao, "handoff");
  const r2 = await falar(novaConversa(), "<script>alert(1)</script>");
  assert.ok(r2.resposta.length > 0);
});

// Bateria: nenhuma resposta determinística pode violar nunca-eventos
test("bateria: todas as respostas da base passam no filtro de nunca-eventos", () => {
  const flat = (x) => [].concat(x ?? []);
  const textos = [...kb.intents.flatMap((i) => [...flat(i.resposta), ...flat(i.resposta_insistencia), ...flat(i.faq)].map((t) => [t, i.isenta ?? []])),
    ...Object.values(kb.mensagens).flatMap((x) => flat(x).map((t) => [t, []])), [kb.urgencia.resposta, []]];
  for (const [t, permitido] of textos) {
    const v = violaNuncaEvento(t.replace(/\{[a-z_0-9]+\}/g, "x"), kb);
    // "Não trabalhamos com descontos" cita a palavra para negar: exceção explícita
    assert.deepEqual(v.filter((x) => !permitido.includes(x)), [], t.slice(0, 60));
  }
});

test("classificação: cobertura de 30 frases reais", () => {
  const casos = [
    ["o que é endolaser", "o_que_e"], ["como funciona o laser", "o_que_e"], ["quem faz o procedimento", "quem_faz"],
    ["onde fica a clínica", "onde"], ["quanto custa", "preco"], ["qual o valor", "preco"], ["quero agendar", "avaliacao"],
    ["tem horário essa semana", "avaliacao"], ["como funciona a reserva", "reserva"], ["posso cancelar?", "reserva"],
    ["tem termo pra assinar", "tcle"], ["aceitam convênio", "convenio"], ["vou ter antes e depois", "resultado"],
    ["tem risco", "risco"], ["dá desconto", "desconto"], ["precisa de drenagem", "pos"], ["bom dia", "saudacao"],
    ["obrigada", "agradecimento"], ["quero emagrecer", "outros_servicos"], ["faz botox?", "outros_servicos"],
    ["quanto tempo dura", "o_que_e"], ["tem anestesia", "o_que_e"], ["qual endereço", "onde"], ["tem estacionamento", "onde"],
    ["quero marcar", "avaliacao"], ["quero um orçamento", "preco"], ["é seguro?", "risco"], ["vai funcionar mesmo", "resultado"],
    ["boa tarde", "saudacao"], ["valeu", "agradecimento"]
  ];
  let ok = 0; const erros = [];
  for (const [txt, esp] of casos) { const c = classificar(txt, kb); if (c.tipo === "intent" && c.intent.id === esp) ok++; else erros.push([txt, esp, c.intent?.id ?? c.tipo]); }
  assert.ok(ok / casos.length >= 0.95, JSON.stringify(erros));
});

test("região citada em qualquer estado alimenta o valor de referência", async () => {
  let r = await falar(novaConversa(), "papada"); r = await falar(r.conv, "quanto custa?"); r = await falar(r.conv, "qual o valor mesmo?");
  assert.match(r.resposta, /papada: R\$ 3\.900/);
});

test("identidade: se perguntada, diz que é assistente virtual e oferece a equipe", async () => {
  const r = await falar(novaConversa(), "você é um robô?");
  assert.match(r.resposta, /assistente virtual/); assert.doesNotMatch(r.resposta, /sou (uma )?pessoa real|sou humana/i);
});

test("chip de região no início já qualifica a dor (sem cair em humano)", async () => {
  const r = await falar(novaConversa(), "Abdome");
  assert.equal(r.conv.estado, "dor"); assert.match(r.camada, /^L0/);
});

test("página e chat nunca expõem a chave Pix", () => {
  const txt = JSON.stringify(kb.mensagens) + JSON.stringify(kb.intents);
  assert.doesNotMatch(txt, /35000039/);
});

test("link do WhatsApp leva região, dor e origem", async () => {
  let r = await falar(novaConversa(), "Papada"); r = await falar(r.conv, "pele sem firmeza");
  const u = decodeURIComponent(linkWhats(r.conv, kb, "instagram"));
  assert.match(u, /região papada/); assert.match(u, /pele sem firmeza/); assert.match(u, /Origem: instagram/);
});

// ---- QA da página (turno 8): pedido de pessoa e escolha de horário sem ambiguidade
const ateHorarios = async () => {
  let r = await falar(novaConversa(), "oi");
  r = await falar(r.conv, "quero reduzir gordura"); r = await falar(r.conv, "na barriga");
  r = await falar(r.conv, "tenho vergonha de usar biquíni"); r = await falar(r.conv, "Prefiro não dizer");
  r = await falar(r.conv, "Ainda não tentei nada"); r = await falar(r.conv, "Não tenho data"); r = await falar(r.conv, "sim, quero ver horário");
  assert.equal(r.conv.estado, "horarios"); return r.conv; // slots: qua 18/11 14:00 e qui 19/11 08:00
};

test("pedido de pessoa: acolhe e encaminha, sem resposta de 'não sei'", async () => {
  for (const t of ["quero falar com uma pessoa", "tem atendente?", "quero falar com um humano", "falar com a equipe"]) {
    const r = await falar(novaConversa(), t);
    assert.equal(r.acao, "handoff", t); assert.match(r.resposta, /^Claro!/, t); assert.doesNotMatch(r.resposta, /não tenho essa informação/i, t);
  }
});

test("horário: aceita dia da semana e hora; 'segunda-feira' não vira opção 2", async () => {
  const conv = await ateHorarios();
  for (const [txt, esperado] of [["pode ser quinta?", "19/11"], ["quarta", "18/11"], ["às 8h", "19/11"], ["14:00", "18/11"], ["o primeiro", "18/11"], ["o segundo", "19/11"], ["2", "19/11"], ["opção 1", "18/11"]]) {
    const r = await falar(structuredClone(conv), txt);
    assert.equal(r.conv.estado, "combinar", txt); assert.match(r.conv.escolha.rotulo, new RegExp(esperado), txt);
  }
  const r = await falar(structuredClone(conv), "segunda-feira");
  assert.equal(r.conv.estado, "horarios"); assert.match(r.resposta, /1\).*\n2\)/s);
});

test("horário: 'outro horário' encaminha à equipe; duas respostas inválidas oferecem a equipe", async () => {
  const conv = await ateHorarios();
  let r = await falar(structuredClone(conv), "prefiro outro horário");
  assert.equal(r.acao, "handoff"); assert.match(r.resposta, /outro dia ou horário/);
  r = await falar(structuredClone(conv), "nenhum desses");
  assert.equal(r.acao, "handoff");
  r = await falar(structuredClone(conv), "sim");
  assert.equal(r.conv.estado, "horarios"); assert.notEqual(r.acao, "handoff");
  r = await falar(r.conv, "hmm");
  assert.equal(r.conv.estado, "horarios"); assert.equal(r.acao, "handoff"); assert.match(r.resposta, /1\).*\n2\)/s); assert.match(r.resposta, /99184-3887/);
});

// ---- turno 9: qualificação, HÓRUS e indicação
test("horários do servidor (HÓRUS) têm prioridade sobre o cálculo local", async () => {
  let r = await falar(novaConversa(), "quero marcar avaliação");
  const slots = [{ chave: "2026-11-19 09:30", rotulo: "quinta-feira, 19/11, às 09:30" }, { chave: "2026-11-23 08:00", rotulo: "segunda-feira, 23/11, às 08:00" }];
  r = await falar(r.conv, "sim", { slots });
  assert.equal(r.conv.estado, "horarios"); assert.match(r.resposta, /09:30/); assert.match(r.resposta, /23\/11/);
});

test("menor de 18 anos: não segue para reserva, vai à equipe", async () => {
  const conv = await ateHorarios();
  let r = await falar(conv, "1"); r = await falar(r.conv, "sim"); r = await falar(r.conv, "sim"); r = await falar(r.conv, "Joana Lima");
  r = await falar(r.conv, "01/01/2012");
  assert.equal(r.acao, "handoff"); assert.match(r.resposta, /responsável legal/); assert.equal(r.conv.dados.whatsapp, undefined);
  assert.equal(r.depois, undefined); assert.equal(r.conv.dados.nascimento, undefined);   // menor: sem convite e sem guardar a data
});

test("convite depois da reserva: sim mostra link; como funciona explica sem prometer; não encerra", async () => {
  const conv = await ateHorarios();
  let r = await falar(conv, "1"); for (const x of ["sim", "sim", "Maria Souza", "10/04/1985", "12991843887", "m@x.com", "Prefiro não dizer", "Google"]) r = await falar(r.conv, x);
  assert.equal(r.conv.estado, "validando"); assert.equal(r.conv.dados.cidade, null);
  r = { conv: aposTermo(aposValidar(r.conv)) };
  const como = await falar(r.conv, "como funciona?"); assert.match(como.resposta, /Contam só pessoas novas/); assert.equal(como.conv.estado, "indicacao");
  const ok = await falar(r.conv, "Quero indicar"); assert.equal(ok.acao, "mostrar_indicacao"); assert.equal(ok.conv.estado, "indicacao_ativa");
  const no = await falar(r.conv, "Agora não"); assert.equal(no.conv.estado, "encerrado"); assert.doesNotMatch(no.resposta, /convite/);
  const prog = await falar(ok.conv, "quantas pessoas já entraram?"); assert.equal(prog.acao, "ver_progresso");
});

test("todo encaminhamento à equipe abre o convite, exceto urgência e LGPD negada", async () => {
  let r = await falar(novaConversa(), "quero falar com uma pessoa");
  assert.equal(r.acao, "handoff"); assert.match(r.depois, /3 e-books/);
  r = await falar(r.conv, "quero participar");
  assert.equal(r.conv.estado, "cadastro"); assert.match(r.resposta, /LGPD/);
  for (const x of ["sim", "Paula Reis", "12981234567", "p@x.com"]) r = await falar(r.conv, x);
  assert.equal(r.acao, "iniciar_conteudo"); assert.equal(r.conv.estado, "validando"); assert.equal(r.conv.dados.nascimento, undefined);
  const u = await falar(novaConversa(), "estou com falta de ar e dor no peito"); assert.equal(u.depois, undefined);
  let l = await falar(novaConversa(), "quero marcar avaliação"); l = await falar(l.conv, "sim");
  l = await falar(l.conv, "1"); l = await falar(l.conv, "sim"); l = await falar(l.conv, "não"); assert.equal(l.acao, "handoff"); assert.equal(l.depois, undefined);
});

test("convidado: recebe e-books e aula com consentimento, depois pode qualificar e agendar sem repetir dados", async () => {
  let r = await falar(novaConversa({ ref: "ana-7k2q" }), "Quero receber os e-books e a aula");
  assert.equal(r.conv.estado, "cadastro"); assert.equal(r.conv.dados.ref, "ana-7k2q");
  for (const x of ["sim", "Bruna Teles", "12987654321", "b@x.com"]) r = await falar(r.conv, x);
  assert.equal(r.acao, "iniciar_conteudo"); assert.match(r.resposta, /código/); assert.equal(r.conv.estado, "validando");
  r = { conv: aposValidar(r.conv) }; assert.equal(r.conv.estado, "objetivo");
  r = await falar(r.conv, "Abdome"); for (const x of ["incomoda na roupa", "Mais de 2 anos", "Ainda não tentei nada", "Não tenho data", "sim"]) r = await falar(r.conv, x);
  assert.equal(r.conv.estado, "horarios");
  r = await falar(r.conv, "2"); assert.match(r.resposta, /necessário reservar/); r = await falar(r.conv, "sim"); assert.match(r.resposta, /nome completo/); assert.doesNotMatch(r.resposta, /LGPD/);
  r = await falar(r.conv, "Bruna Teles Ramos"); assert.match(r.resposta, /data de nascimento/);
  for (const x of ["10/04/1990", "Jacareí"]) r = await falar(r.conv, x);
  assert.equal(r.acao, "iniciar_agendamento"); assert.match(r.resposta, /já está confirmado/);   // não pergunta "como conheceu": veio por convite
  assert.equal(r.conv.dados.nome, "Bruna Teles Ramos");
  const b = await falar(novaConversa({ ref: "ana-7k2q" }), "Quero avaliar o Endolaser");
  assert.notEqual(b.conv.estado, "cadastro");
  assert.equal(novaConversa({ ref: "<script>" }).estado, "inicio");
});

test("pergunta durante a qualificação é respondida e a pergunta pendente volta", async () => {
  let r = await falar(novaConversa(), "Abdome"); r = await falar(r.conv, "gordurinha");
  assert.equal(r.conv.estado, "tempo");
  r = await falar(r.conv, "aceita convênio?");
  assert.equal(r.conv.estado, "tempo"); assert.match(r.resposta, /particular/i); assert.match(r.resposta, /há quanto tempo/i);
});

test("textos novos passam no filtro de nunca-eventos e não citam chave Pix", () => {
  const M = kb.mensagens;
  for (const k of ["convite_mensagem_amigo", "lgpd", "pos_escolha", "reserva_passos", "convite_pitch", "convite_pitch_curto", "convite_como", "convite_link", "convidado_boas_vindas", "conteudo_liberado", "menor", "sem_horario", "conteudo_codigo", "reserva_codigo", "reserva_codigo_registrado", "aguardando_codigo", "aguardando_termo", "reserva_ok", "reserva_falhou", "volta", "pedir_nome_conteudo", "pedir_nome_completo"])
    assert.deepEqual(violaNuncaEvento(M[k], kb), [], k);
  assert.doesNotMatch(JSON.stringify(kb.config.biblioteca) + JSON.stringify(M), /35000039|gr[aá]tis|brinde/i);
});
