// Trava de voz: nenhuma fala da assistente pode sair sem educação e profissionalismo.
// 1) linter de todo texto da base; 2) bateria de provocações (cliente rude, irritado, inconveniente);
// 3) saída do modelo de IA (L1) com grosseria é barrada; 4) jornadas completas com várias sementes, sem repetição em sequência;
// 5) alinhamento comercial: as respostas que tiram dúvida e objeção conduzem à avaliação.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { responder, novaConversa, violaVoz, violaNuncaEvento, lerClima } from "../motor/motor.mjs";

const kb = JSON.parse(readFileSync(new URL("../conhecimento/endolaser.json", import.meta.url)));
const agora = { y: 2026, m: 11, d: 18, h: 10, min: 0, dow: 3 };
const falar = (conv, txt, ctx = {}) => responder(conv, txt, kb, { agora, ocupados: [], ...ctx });
const flat = (x) => [].concat(x ?? []);
const SEMENTES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const limpo = (t) => t.replace(/\{[a-z_0-9]+\}/g, "Ana");

// ------------------------------------------------------------------ 1. linter da base inteira
const textosDaBase = () => [
  ...Object.entries(kb.mensagens).flatMap(([k, x]) => flat(x).map((t) => [k, t])),
  ...kb.intents.flatMap((i) => [...flat(i.resposta), ...flat(i.faq), ...flat(i.resposta_insistencia)].map((t) => ["intent:" + i.id, t])),
  ...Object.entries(kb.hostilidade.respostas).flatMap(([k, x]) => flat(x).map((t) => ["clima:" + k, t])),
  ...Object.entries(kb.repertorio.historias).map(([k, h]) => ["historia:" + k, h.texto]),
  ["urgencia", kb.urgencia.resposta]
];

test("linter: todo texto da base passa nas regras duras e de estilo da voz", () => {
  const falhas = [];
  for (const [onde, t] of textosDaBase()) {
    const v = violaVoz(limpo(t), kb, "estilo");
    if (v.length) falhas.push(`${onde}: ${v.join(",")} → ${t.slice(0, 90)}`);
  }
  assert.deepEqual(falhas, []);
});

test("linter: nenhum texto da base fere os nunca-eventos (compliance)", () => {
  for (const [onde, t] of textosDaBase()) {
    const isenta = onde === "intent:desconto" ? ["NE4"] : [];
    assert.deepEqual(violaNuncaEvento(limpo(t), kb).filter((x) => !isenta.includes(x)), [], onde);
  }
});

test("linter: o próprio detector pega grosseria, gíria, pressão, julgamento do corpo, caixa alta e pontuação exaltada", () => {
  const ruins = {
    V1: "Como eu já disse, você não entendeu a regra.", V2: "Oie amiga, vc quer marcar?", V3: "Garanta já o seu horário, últimas vagas!",
    V4: "Essa barriguinha sai rapidinho.", V5: "Por que você não respondeu?", V_CAIXA_ALTA: "ATENÇÃO: leia o termo.", V_PONTUACAO: "Ótimo!! Vamos marcar??"
  };
  for (const [regra, frase] of Object.entries(ruins)) assert.ok(violaVoz(frase, kb).includes(regra), `${regra}: ${frase}`);
  assert.ok(violaVoz("Prezado, informamos que...", kb, "estilo").includes("V6"));
  assert.deepEqual(violaVoz("Obrigada por contar. Quer que eu veja dois horários?", kb, "estilo"), []);
  assert.deepEqual(violaVoz("O CPF e o CNPJ seguem a LGPD.", kb, "estilo"), [], "siglas permitidas não contam como grito");
});

// ------------------------------------------------------------------ 2. provocações
const PROVOCACOES = [
  ["ofensa", "vocês são uns idiotas"], ["ofensa", "que lixo de atendimento"], ["ofensa", "isso é palhaçada, golpista"], ["ofensa", "vai se ferrar"],
  ["irritacao", "que demora, aff"], ["irritacao", "não entendi nada"], ["irritacao", "que chato, já respondi isso"], ["irritacao", "pelo amor de deus, não funciona"],
  ["assedio", "você é linda"], ["assedio", "manda foto"], ["assedio", "casa comigo"],
  [null, "você é um robô?"], [null, "isso é golpe?"], [null, "tenho vergonha do meu corpo"], [null, "QUANTO CUSTA ISSO???"],
  [null, "me dá um desconto"], [null, "só hoje tem promoção?"], [null, "promete que funciona?"], [null, "quero falar com uma pessoa"], [null, "asdfgh"]
];
const ESTADOS = async (semente) => {
  const c0 = novaConversa({ semente });
  const r1 = await falar(c0, "abdome"); const r2 = await falar(r1.conv, "incomoda na roupa"); const r3 = await falar(r2.conv, "2 anos");
  const r4 = await falar(r3.conv, "academia"); const r5 = await falar(r4.conv, "não tenho data"); const r6 = await falar(r5.conv, "sim");
  const r7 = await falar(r6.conv, "1");
  return { inicio: c0, dor: r1.conv, explicar: r5.conv, horarios: r6.conv, combinar: r7.conv };
};

test("provocações: em qualquer etapa e semente, a resposta é educada, profissional e oferece um caminho", async () => {
  for (const s of SEMENTES) {
    const est = await ESTADOS(s);
    for (const [nome, conv] of Object.entries(est)) for (const [clima, frase] of PROVOCACOES) {
      const r = await falar(conv, frase);
      const tudo = [r.resposta, r.depois].filter(Boolean).join("\n");
      assert.ok(r.resposta.trim().length > 20, `${nome}/${frase}: resposta vazia`);
      assert.deepEqual(violaVoz(tudo, kb), [], `${nome}/${frase}: ${tudo}`);
      assert.deepEqual(violaNuncaEvento(tudo, kb).filter((x) => x !== "NE4" || !/descontos nem cortesias/.test(tudo)), [], `${nome}/${frase}`);
      assert.ok(/\?|botão|aqui embaixo|WhatsApp|192/.test(tudo), `${nome}/${frase}: sem próximo passo → ${tudo}`);
      if (clima) assert.equal(lerClima(frase, kb), clima, frase);
      if (clima === "ofensa") { assert.equal(r.acao, "handoff"); assert.match(r.resposta, /desculp|lament/i); assert.equal(r.depois, undefined, "sem convite para quem ofendeu"); }
      if (clima === "irritacao") { assert.match(r.resposta, /desculp/i, frase); if (nome === "combinar") assert.match(r.resposta, /reserva de/, frase); else if (nome !== "horarios") assert.match(r.resposta, /1\).*\n2\)/s, `irritação vira atalho para os horários: ${r.resposta}`); }
      if (clima === "assedio") assert.match(r.resposta, /assistente virtual/, frase);
    }
  }
});

test("provocações: nomes e respostas comuns não disparam o detector de clima por engano", () => {
  for (const t of ["Linda Souza", "Gabriela Mano", "caiu no lixo eletrônico", "Amanda Gatto", "sim, concordo", "São José dos Campos", "abdome e flancos"]) assert.equal(lerClima(t, kb), null, t);
});

// ------------------------------------------------------------------ 3. IA (L1) não fala fora do padrão
test("saída do modelo de IA com grosseria, gíria, pressão ou caixa alta é barrada e trocada por resposta segura", async () => {
  for (const ruim of ["Como eu já disse, presta atenção.", "Oie amiga, bora marcar kkk", "GARANTA JÁ, últimas vagas!!", "Essa barriguinha some rapidinho."]) {
    const r = await falar(novaConversa({ semente: 3 }), "uma pergunta bem diferente sobre algo raro", { l1: async () => ({ reply: ruim, handoff: false }) });
    assert.match(r.camada, /^bloqueio:/, ruim); assert.equal(r.acao, "handoff");
    assert.deepEqual(violaVoz(r.resposta, kb), []); assert.match(r.resposta, /WhatsApp/);
  }
});

// ------------------------------------------------------------------ 4. jornadas completas
const JORNADA = ["oi", "flacidez", "papada", "a pele caiu depois que emagreci", "uns 2 anos", "academia e dieta", "não tenho data", "sim", "1", "sim", "sim", "Maria Clara Souza", "10/05/1988", "12991234567", "maria@exemplo.com", "Jacareí", "Instagram"];
test("jornadas: com 10 sementes, toda fala passa na voz e nenhuma se repete em sequência", async () => {
  const fraseInicial = new Set();
  for (const s of SEMENTES) {
    let c = novaConversa({ semente: s }), anterior = "";
    for (const msg of JORNADA) {
      const r = await falar(c, msg); c = r.conv;
      assert.deepEqual(violaVoz(r.resposta, kb, "estilo").filter((x) => x !== "E_TAMANHO"), [], `${s}/${msg}: ${r.resposta}`);
      assert.notEqual(r.resposta, anterior, `${s}/${msg}: repetiu a mesma fala`);
      anterior = r.resposta;
      if (msg === "não tenho data") fraseInicial.add(r.resposta.slice(0, 40));
    }
    assert.equal(c.estado, "validando", `semente ${s} terminou em ${c.estado}`);
  }
  assert.ok(fraseInicial.size >= 2, "a explicação da avaliação varia entre conversas");
});

test("jornada: espelha a região que a pessoa escolheu e valida o esforço de quem já tentou", async () => {
  let c = novaConversa({ semente: 1 });
  let r = await falar(c, "papada"); assert.match(r.resposta, /papada/);
  r = await falar(r.conv, "incomoda nas fotos"); r = await falar(r.conv, "1 ano"); r = await falar(r.conv, "dieta e academia");
  assert.match(r.resposta, /resist|esforço|olhar médico/);
});

// ------------------------------------------------------------------ 5. alinhamento comercial
test("venda primeiro: dúvidas e objeções do topo do funil terminam conduzindo à avaliação ou à região", async () => {
  const perguntas = ["quanto custa", "como funciona o endolaser", "sem aspirar sai mesmo?", "está caro", "vi mais barato em outro lugar", "é definitivo?", "qual a diferença para a lipo", "dá desconto?", "como é a avaliação"];
  for (const s of [0, 1, 2]) for (const p of perguntas) {
    const r = await falar(novaConversa({ semente: s }), p);
    assert.match(r.resposta, /hor[áa]rio|avalia|região/i, p);
    assert.match(r.resposta.trim(), /\?$/, `${p}: termina com pergunta → ${r.resposta}`);
  }
});

test("identidade honesta: 'é robô?' sempre responde assistente virtual e oferece a equipe", async () => {
  for (const s of SEMENTES) {
    const r = await falar(novaConversa({ semente: s }), "você é robô?");
    assert.match(r.resposta, /assistente virtual/); assert.match(r.resposta, /equipe/);
  }
});
