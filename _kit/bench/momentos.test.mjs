// Momentos exatos da conversa (v6.1): quando a assistente se apresenta, quando o Dr. Couto é apresentado,
// quando a reserva é explicada por inteiro e quando (e quanto) se pode pressionar a decisão.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { responder, novaConversa, violaVoz, violaNuncaEvento, prazoReserva, uma } from "../motor/motor.mjs";

const kb = JSON.parse(readFileSync(new URL("../conhecimento/endolaser.json", import.meta.url)));
const agora = { y: 2026, m: 11, d: 18, h: 10, min: 0, dow: 3 };
const falar = (conv, txt) => responder(conv, txt, kb, { agora, ocupados: [] });
const SEMENTES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const perguntas = (t) => (String(t).match(/\?/g) || []).length;
const limpa = (r) => { const tudo = [r.resposta, r.depois].filter(Boolean).join("\n"); assert.deepEqual(violaVoz(tudo, kb), [], tudo); assert.deepEqual(violaNuncaEvento(tudo, kb), [], tudo); return tudo; };

async function ate(estado, semente = 0, prazo = "não tenho data") {
  let r = await falar(novaConversa({ semente }), "abdome");
  for (const x of ["incomoda na roupa", "2 anos", "academia", prazo]) r = await falar(r.conv, x);
  if (estado === "explicar") return r.conv;
  r = await falar(r.conv, "sim"); if (estado === "horarios") return r.conv;
  r = await falar(r.conv, "1"); return r.conv;
}

test("M1 · abertura: a assistente se apresenta (só ela), sinaliza a avaliação e faz uma pergunta", () => {
  for (const s of SEMENTES) {
    const a = uma(kb.mensagens.abertura, { semente: s, turnos: 0 }, "abertura");
    assert.match(a, /assistente virtual do Instituto Couto|Sou a assistente virtual/); assert.match(a, /avaliação/);
    assert.doesNotMatch(a, /CRM|Dr\. José/); assert.equal(perguntas(a), 1);
  }
});

test("M3 · o Dr. Couto é apresentado logo depois da escuta: médico, CRM, quem avalia é quem faz, e o convite", async () => {
  for (const s of SEMENTES) {
    let r = await falar(novaConversa({ semente: s }), "abdome");
    for (const x of ["incomoda na roupa", "2 anos", "academia"]) { r = await falar(r.conv, x); assert.doesNotMatch(r.resposta, /CRM/, "sem autopromoção durante a escuta"); }
    r = await falar(r.conv, "não tenho data");
    assert.equal(r.conv.estado, "explicar");
    assert.match(r.resposta, /Dr\. José M Couto/); assert.match(r.resposta, /CRM-SP 209089/); assert.match(r.resposta, /avalia e faz|quem avalia é quem faz/);
    assert.match(r.resposta.trim(), /dois horários\?$/); limpa(r);
  }
});

test("M5 · reserva: logo após a escolha, 'é necessário reservar' e tudo, antes de qualquer dado", async () => {
  for (const s of SEMENTES) {
    const c = await ate("horarios", s);
    const r = await falar(c, "2");
    assert.equal(r.conv.estado, "combinar"); assert.equal(r.conv.dados.nome, undefined);
    for (const x of [/necessário reservar o seu horário/, /R\$ 300,00/, /Pix/, /35\.000\.039\/0001-93/, /Termo de Atendimento \(TCLE\)/, /código/, /identificado na conta/, /24 horas/, /remarcar uma vez/, /não é abatida/, /comprovante/])
      assert.match(r.resposta, x, `${s}: ${x}`);
    assert.equal(perguntas(r.resposta), 1); assert.match(r.resposta.trim(), /Podemos seguir\?$/); limpa(r);
    const ok = await falar(r.conv, "sim");
    assert.equal(ok.conv.estado, "dados"); assert.match(ok.resposta, /LGPD/);
  }
});

test("M5 · dúvida durante a reserva é respondida e a pergunta de seguir volta, com uma pergunta só", async () => {
  const c = await ate("combinar");
  for (const q of ["é reembolsável?", "quanto custa?", "o que é o termo?", "é golpe?"]) {
    const r = await falar(structuredClone(c), q);
    assert.equal(r.conv.estado, "combinar", q); assert.match(r.resposta, /seguir com a reserva de/, q);
    assert.ok(perguntas(r.resposta) <= 1, `${q}: ${r.resposta}`); limpa(r);
  }
  const r = await falar(structuredClone(c), "asdfgh"); assert.match(r.resposta, /seguir com a reserva/);
  const o = await falar(structuredClone(c), "prefiro outro dia"); assert.equal(o.acao, "handoff"); assert.match(o.resposta, /outro dia ou horário/);
});

test("M6 · decisão: na explicação, sondagem (sem pressão); na segunda hesitação, respeito", async () => {
  for (const frase of ["vou pensar", "agora não", "não", "depois eu vejo"]) {
    const c = await ate("explicar");
    const r1 = await falar(c, frase);
    assert.equal(r1.conv.estado, "explicar", frase); assert.match(r1.resposta, /dúvida|pesa/, frase);
    assert.doesNotMatch(r1.resposta, /sequência|outras pessoas|1\)/, "sem pressão antes dos horários"); limpa(r1);
    const r2 = await falar(r1.conv, "vou pensar");
    assert.equal(r2.acao, "handoff"); assert.match(r2.resposta, /porta|retomar|quando fizer sentido/); limpa(r2);
  }
});

test("M6 · decisão: com os horários na mesa, um único empurrão leve e verdadeiro; depois, respeito", async () => {
  for (const s of SEMENTES) {
    const c = await ate("horarios", s);
    const r1 = await falar(c, "vou pensar");
    assert.equal(r1.conv.estado, "horarios"); assert.equal(r1.conv.empurrao, true);
    assert.match(r1.resposta, /decisão é sua|pensar com calma/); assert.match(r1.resposta, /sequência/); assert.match(r1.resposta, /1\).*\n2\)/s);
    assert.equal(perguntas(r1.resposta), 1); limpa(r1);
    const r2 = await falar(r1.conv, "vou pensar mais um pouco");
    assert.equal(r2.acao, "handoff"); assert.doesNotMatch(r2.resposta, /sequência|outras pessoas/); limpa(r2);
    // escolhendo depois do empurrão, segue normal para a reserva
    const r3 = await falar(r1.conv, "1"); assert.equal(r3.conv.estado, "combinar");
  }
});

test("M6 · o empurrão usa a data que a própria pessoa contou; com cônjuge, decide junto sem pressa", async () => {
  let r = await falar(await ate("horarios", 0, "Sim, nos próximos 3 meses"), "vou pensar");
  assert.match(r.resposta, /data importante/); limpa(r);
  r = await falar(await ate("horarios"), "vou falar com meu marido");
  assert.match(r.resposta, /decidir junto/); assert.match(r.resposta, /não obriga/); limpa(r);
});

test("M6 · empurrão é um só por conversa: quem hesitou nos horários e depois na reserva recebe respeito", async () => {
  let r = await falar(await ate("horarios"), "vou pensar"); assert.equal(r.conv.empurrao, true);
  r = await falar(r.conv, "2"); assert.equal(r.conv.estado, "combinar");
  r = await falar(r.conv, "vou pensar"); assert.equal(r.acao, "handoff"); limpa(r);
  // na reserva, a primeira hesitação recebe o empurrão da reserva
  r = await falar(await ate("combinar"), "vou pensar");
  assert.equal(r.conv.estado, "combinar"); assert.match(r.resposta, /no seu nome/); assert.match(r.resposta.trim(), /Podemos seguir\?$/); limpa(r);
});

test("M6 · recusa clara nunca recebe insistência", async () => {
  for (const est of ["explicar", "horarios", "combinar"]) {
    const r = await falar(await ate(est), "não quero, obrigada");
    assert.equal(r.acao, "handoff", est); assert.doesNotMatch(r.resposta, /sequência|outras pessoas|dúvida/, est); limpa(r);
  }
});

test("M6 · nenhum texto de decisão usa urgência falsa, escassez fabricada ou promessa", () => {
  const D = kb.decisao, textos = [...D.sondar, ...D.respeito, ...Object.values(D.empurrao).flat()];
  for (const t of textos) {
    const x = t.replace(/\{[a-z_0-9]+\}/g, "quinta-feira, 19/11, às 08:00");
    assert.deepEqual(violaVoz(x, kb), [], x); assert.deepEqual(violaNuncaEvento(x, kb), [], x);
    assert.doesNotMatch(x, /últim|só hoje|corra|garanta|promo|desconto|resultado garantido/i, x);
  }
});

test("M7 · prazo real da pré-reserva: mesma regra do backend (12 h ou 2 h antes; horário próximo segura até 30 min antes)", () => {
  const ag = { y: 2026, m: 11, d: 19, h: 10, min: 0 };
  assert.equal(prazoReserva(ag, "2026-11-20 09:00"), "hoje, às 22:00");
  assert.equal(prazoReserva(ag, "2026-11-19 16:00"), "hoje, às 14:00");
  assert.equal(prazoReserva({ y: 2026, m: 11, d: 19, h: 20, min: 30 }, "2026-11-21 14:00"), "amanhã, às 08:30");
  assert.equal(prazoReserva({ y: 2026, m: 11, d: 30, h: 20, min: 0 }, "2026-12-02 14:00"), "amanhã, às 08:00");
  assert.equal(prazoReserva({ y: 2026, m: 11, d: 19, h: 15, min: 0 }, "2026-11-19 16:30"), "hoje, às 16:00");
  assert.equal(prazoReserva(ag, "inválido"), null);
  const t = kb.mensagens.reserva_ok;
  assert.match(t, /\{prazo\}/); assert.match(t, /identifica o pagamento na conta/); assert.match(t, /volta para a agenda/);
});

test("horários na mesa nunca são chamados de 'reservados' antes da reserva", () => {
  for (const t of [].concat(kb.mensagens.horarios_mantidos)) assert.doesNotMatch(t, /reservad/);
});
