// Motor híbrido da assistente Endolaser — L0 (determinístico) + L1 (modelo leve opcional) + humano.
// Sem dependências. Roda em Node e no navegador (landing em artefato).

export const norm = (t) =>
  String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// frase casa se aparecer como palavra(s) inteira(s)
export const contem = (texto, frase) => new RegExp(`(^|[^a-z0-9])${esc(norm(frase))}s?([^a-z0-9]|$)`).test(texto);
const algum = (texto, lista) => lista.some((f) => contem(texto, f));

// ---- entendimento tolerante (v6.4): abreviações de WhatsApp e erros de digitação, sem IA e sem custo
// abreviações vêm da base (kb.abreviacoes); a troca é por palavra inteira.
export function expandir(t, kb) {
  const a = kb.abreviacoes || {};
  return t.replace(/[a-z0-9$]+/g, (w) => a[w] ?? w).replace(/\s+/g, " ").trim();
}
// distância de edição (Damerau, limitada): 1 erro em palavras de 5+ letras, 2 em palavras de 9+
function dist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let menor = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      menor = Math.min(menor, d[i][j]);
    }
    if (menor > max) return max + 1;
  }
  return d[a.length][b.length];
}
const tolera = (w) => (w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0);
const parece = (w, p) => w === p || (tolera(p) > 0 && w[0] === p[0] && dist(w, p, tolera(p)) <= tolera(p)) || (p.length >= 5 && w.startsWith(p));
// frase "parece" presente: todas as palavras da frase aparecem no texto, em ordem, cada uma com a tolerância acima
export function contemAprox(texto, frase) {
  const ws = texto.split(/[^a-z0-9]+/).filter(Boolean), ps = norm(frase).split(/[^a-z0-9]+/).filter(Boolean);
  if (!ps.length || ps.every((p) => p.length < 5)) return false;   // frase só de palavras curtas: exige casamento exato
  let i = 0;
  for (const p of ps) { while (i < ws.length && !parece(ws[i], p)) i++; if (i++ >= ws.length) return false; }
  return true;
}
const algumAprox = (texto, lista) => lista.some((f) => contemAprox(texto, f));

export const fmtBRL = (n) => "R$ " + Number(n).toLocaleString("pt-BR");
const preencher = (s, v) => String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));

// ---- variação (anti-robô): um texto pode ter várias formas; a escolha depende da conversa e do turno,
// então a mesma pessoa não recebe a mesma fórmula em sequência e o teste continua determinístico.
const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const uma = (x, c = {}, k = "") => (Array.isArray(x) ? x[(hash(k) + (c.semente || 0) + (c.turnos || 0)) % x.length] : x);
export const todas = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const variar = (obj, c) => Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, uma(x, c, k)]));

// ---- VOZ: trava de educação e profissionalismo (porta única de saída, junto dos nunca-eventos).
// Regras "duras" bloqueiam em tempo real (a fala é trocada por uma resposta segura); regras de "estilo" reprovam no teste.
const EMOJI = /\p{Extended_Pictographic}/gu;
export function violaVoz(texto, kb, nivel = "duro") {
  const v = kb.voz; if (!v) return [];
  const bruto = String(texto ?? ""), t = norm(bruto), out = [];
  for (const r of v.regras) {
    if (nivel === "duro" && r.tipo !== "duro") continue;
    if (r.padrao && new RegExp(r.padrao).test(t)) out.push(r.id);
  }
  const siglas = new Set(v.siglas_permitidas || []);
  if ((bruto.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}\b/g) || []).some((w) => !siglas.has(w))) out.push("V_CAIXA_ALTA");
  if (/[!?]{2,}|!.*!/.test(bruto)) out.push("V_PONTUACAO");
  if ((bruto.match(EMOJI) || []).length > (v.limites?.emojis ?? 1)) out.push("V_EMOJI");
  if (nivel !== "duro") {
    const lim = v.limites || {};
    if (bruto.replace(/\n\d\) [^\n]*/g, "").length > (lim.caracteres ?? 720)) out.push("E_TAMANHO");
    if ((bruto.match(/\?/g) || []).length > (lim.perguntas ?? 1)) out.push("E_PERGUNTAS");
    if (/^(digite|informe|envie|responda|escreva|aguarde|clique|preencha)\b/i.test(bruto.trim()) && !/por favor|pode |e so |é só /i.test(bruto)) out.push("E_IMPERATIVO_SECO");
  }
  return [...new Set(out)];
}

export function validarNome(t) { const p = t.trim().split(/\s+/); return p.length >= 2 && p.every((x) => x.length >= 2) && t.length <= 80 && !/\d/.test(t); }
export function normalizarWhats(t) { const d = t.replace(/\D/g, "").replace(/^55/, ""); return /^\d{2}9\d{8}$/.test(d) ? "55" + d : null; }
export function validarEmail(t) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim()) && t.length <= 120; }

// ---- agenda: 2 horários, fila "manhã primeiro", dentro de janela_dias, só dias de avaliação
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// Regra do HÓRUS (guarda hrs_agenda_guard_l3): agenda SEQUENCIAL. Em cada turno, turno vazio só começa no
// primeiro horário; com atendimentos, o novo início não pode deixar lacuna depois do último (encaixe em vão é aceito).
// ocupados: ["YYYY-MM-DD HH:MM"] (blocos do tamanho da avaliação) · ocupacao: [{inicio:"YYYY-MM-DD HH:MM", fim:"YYYY-MM-DD HH:MM"}]
export function iniciosValidos(dataISO, turno, cfg, ocupados = [], ocupacao = [], minimoMin = -1) {
  const passo = cfg.avaliacao_minutos, ocup = [];
  for (const k of ocupados) if (k.startsWith(dataISO)) { const m = toMin(k.slice(11)); ocup.push([m, m + passo]); }
  for (const o of ocupacao || []) if (String(o.inicio).startsWith(dataISO)) ocup.push([toMin(String(o.inicio).slice(11, 16)), String(o.fim).startsWith(dataISO) ? toMin(String(o.fim).slice(11, 16)) : 24 * 60]);
  const noTurno = ocup.filter(([a]) => a >= turno.ini && a < turno.lim);
  const fimUltimo = noTurno.length ? Math.max(...noTurno.map(([, b]) => b)) : null;
  const out = [];
  for (let m = turno.ini; m <= turno.fim; m += passo) {
    if (m < minimoMin) continue;
    if (ocup.some(([a, b]) => m < b && m + passo > a)) continue;           // choque
    if (fimUltimo === null ? m !== turno.ini : m > fimUltimo) continue;      // sequência sem lacuna
    out.push(m);
  }
  return out;
}

const turnosDe = (cfg) => [
  { nome: "manha", ini: toMin(cfg.manha_inicio), fim: toMin(cfg.manha_ultimo_inicio), lim: toMin(cfg.tarde_inicio) },
  { nome: "tarde", ini: toMin(cfg.tarde_inicio), fim: toMin(cfg.tarde_fim ?? "18:00") - cfg.avaliacao_minutos, lim: 24 * 60 }
];

export function proximosHorarios(agora, cfg, ocupados = [], ocupacao = []) {
  // agora: {y,m,d,h,min} em America/Sao_Paulo. Dois horários: manhãs primeiro (um por dia, na sequência da agenda);
  // só passa à tarde quando as manhãs da janela se esgotam. Apresentados em ordem cronológica.
  const out = [];
  for (const turno of turnosDe(cfg)) {
    for (let off = 0; off <= cfg.janela_dias && out.length < 2; off++) {
      const dt = new Date(Date.UTC(agora.y, agora.m - 1, agora.d + off));
      const dow = dt.getUTCDay();
      if (!cfg.dias_avaliacao.includes(dow)) continue;
      const data = dt.toISOString().slice(0, 10);
      const ok = iniciosValidos(data, turno, cfg, ocupados, ocupacao, off === 0 ? agora.h * 60 + agora.min + (cfg.antecedencia_min ?? 60) : -1); // antecedência mínima de 1h
      if (!ok.length) continue;
      const m = ok[0];
      out.push({ chave: `${data} ${hhmm(m)}`, rotulo: `${DIAS[dow]}, ${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}, às ${hhmm(m)}` });
    }
    if (out.length === 2) break; // um turno por vez
  }
  return out.sort((a, b) => (a.chave < b.chave ? -1 : 1));
}

// Data de nascimento (DD/MM/AAAA) -> {iso, idade} ou null
export function lerNascimento(t, agora) {
  const m = /^\s*(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})\s*$/.exec(String(t)) || /^\s*(\d{2})(\d{2})(\d{4})\s*$/.exec(String(t));
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900) return null;
  let idade = agora.y - y; if (agora.m < mo || (agora.m === mo && agora.d < d)) idade--;
  if (idade < 0 || idade > 110) return null;
  return { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, idade };
}

// ---- classificação L0
export function classificar(texto, kb, opts = {}) {
  const t = expandir(norm(texto), kb);
  const u = kb.urgencia; // orientaforge-urgencia-redflags: na dúvida entre dois níveis, vale o mais alto
  if (u.vida && algum(t, u.vida.padroes)) return { tipo: "urgencia", nivel: "vida" };
  if (algum(t, u.padroes)) return { tipo: "urgencia", nivel: 1 };
  if (u.alerta && algum(t, u.alerta.padroes)) return { tipo: "urgencia", nivel: 2 };
  const g = kb.gatilhos_humano;
  if (algum(t, g.pessoa)) return { tipo: "humano", motivo: "pediu_pessoa" };
  if (algum(t, g.clinico)) return { tipo: "humano", motivo: "clinico" };
  if (algum(t, g.financeiro)) return { tipo: "humano", motivo: "financeiro" };
  let melhor = null, segundo = null;
  for (const it of kb.intents) {
    if (kb.config.somente_aprovados && it.aprovacao === "rascunho") continue; // build de produção: só texto aprovado
    let pontos = 0;
    for (const p of it.padroes) if (contem(t, p)) pontos += norm(p).split(" ").length; // frases longas pesam mais
    if (pontos && it.prioridade) pontos += 10;
    if (pontos && (!melhor || pontos > melhor.pontos)) { segundo = melhor; melhor = { it, pontos }; }
    else if (pontos && (!segundo || pontos > segundo.pontos)) segundo = { it, pontos };
  }
  // empate entre dois assuntos diferentes (ex.: "resultado e recuperação"): pergunta qual, em vez de chutar
  if (melhor && segundo && segundo.pontos === melhor.pontos && !melhor.it.prioridade && opts.permitirDuvida !== false && melhor.it.rotulo && segundo.it.rotulo)
    return { tipo: "duvida", opcoes: [melhor.it, segundo.it] };
  if (melhor) return { tipo: "intent", intent: melhor.it, pontos: melhor.pontos };
  // segunda passada, tolerante a erro de digitação: urgência primeiro (na dúvida, vale o mais alto)
  if (u.vida && algumAprox(t, u.vida.padroes)) return { tipo: "urgencia", nivel: "vida", aprox: true };
  if (algumAprox(t, u.padroes)) return { tipo: "urgencia", nivel: 1, aprox: true };
  if (u.alerta && algumAprox(t, u.alerta.padroes)) return { tipo: "urgencia", nivel: 2, aprox: true };
  if (algumAprox(t, g.pessoa)) return { tipo: "humano", motivo: "pediu_pessoa", aprox: true };
  if (algumAprox(t, g.clinico)) return { tipo: "humano", motivo: "clinico", aprox: true };
  const cand = [];
  for (const it of kb.intents) {
    if (kb.config.somente_aprovados && it.aprovacao === "rascunho") continue;
    let pontos = 0;
    for (const p of it.padroes) if (contemAprox(t, p)) pontos += norm(p).split(" ").length;
    if (pontos) cand.push({ it, pontos: pontos + (it.prioridade ? 10 : 0) });
  }
  cand.sort((a, b) => b.pontos - a.pontos);
  if (cand.length === 1 || (cand.length > 1 && cand[0].pontos - cand[1].pontos >= 2)) return { tipo: "intent", intent: cand[0].it, pontos: cand[0].pontos, aprox: true };
  if (cand.length > 1 && opts.permitirDuvida !== false && cand[0].it.rotulo && cand[1].it.rotulo) return { tipo: "duvida", opcoes: [cand[0].it, cand[1].it] };
  if (cand.length) return { tipo: "intent", intent: cand[0].it, pontos: cand[0].pontos, aprox: true };
  return { tipo: "desconhecido" };
}

export const achar = (texto, mapa) => { const t = norm(texto); for (const [k, v] of Object.entries(mapa)) if (algum(t, v)) return k; return null; };

// ---- filtro de saída (porta única, estilo SF-28)
export function violaNuncaEvento(resposta, kb) {
  const t = norm(resposta);
  return kb.nunca_eventos.filter((e) => new RegExp(e.padrao).test(t)).map((e) => e.id);
}
// cliente hostil, irritado ou inconveniente: a assistente nunca devolve no mesmo tom
export function lerClima(texto, kb) {
  const h = kb.hostilidade; if (!h) return null; const t = norm(texto);
  if (algum(t, h.ofensa)) return "ofensa";
  if (algum(t, h.assedio)) return "assedio";
  if (algum(t, h.irritacao)) return "irritacao";
  return null;
}

const fmtCNPJ = (x) => String(x ?? "").replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
// tira a última frase se ela for pergunta: quando a fala ganha outra pergunta no fim, fica uma só
const semPerguntaFinal = (s) => String(s).replace(/[^.!?\n]*\?\s*$/, "").trim();

// Prazo real da pré-reserva — mesma regra do backend: min(agora + hold, início do horário − 2 h).
// agora: {y,m,d,h,min} em São Paulo; chave: "YYYY-MM-DD HH:MM" (São Paulo). Devolve "hoje, às 22:00" | "amanhã, às 07:00" | "20/11, às 07:00".
export function prazoReserva(agora, chave, holdHoras = 12) {
  if (!agora || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(chave))) return null;
  const local = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi);   // relógio de São Paulo tratado como UTC: só aritmética
  const ag = local(agora.y, agora.m, agora.d, agora.h ?? 0, agora.min ?? 0);
  const [dt, hm] = String(chave).split(" "), [y, m, d] = dt.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const ini = local(y, m, d, h, mi);
  let lim = Math.min(ag + holdHoras * 3600e3, ini - 2 * 3600e3);
  if (lim < ag + 30 * 60e3) lim = ini - 30 * 60e3;          // horário próximo: segura até 30 min antes do início
  if (lim <= ag) return null;
  const x = new Date(lim), dia = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()), hoje = Date.UTC(agora.y, agora.m - 1, agora.d);
  const hora = `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
  const qual = dia === hoje ? "hoje" : dia - hoje === 864e5 ? "amanhã" : `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${qual}, às ${hora}`;
}

export function novaConversa(opts = {}) {
  const c = { estado: "inicio", dados: {}, slots: null, escolha: null, insistiuPreco: false, turnos: 0, l1: 0, handoff: false, historico: [],
    semente: Number.isInteger(opts.semente) ? opts.semente : Math.floor(Math.random() * 997) };
  if (opts.ref && /^[a-z]{2,12}-[a-z2-9]{4}$/.test(opts.ref)) { c.dados.ref = opts.ref; c.estado = "convidado"; }
  return c;
}

const sim = (t) => /^(s|sim|claro|ok|pode|concordo|aceito|quero|vamos|bora|combinado|isso|pode sim)\b/.test(norm(t));
const nao = (t) => /^(n|nao|não|prefiro nao|nao quero|agora nao|depois)\b/.test(norm(t));
const pular = (t) => /^(prefiro (nao|não)|pular|nao sei|não sei|nao quero dizer)/.test(norm(t));

// Campos coletados, na ordem. "conteudo" = só para receber e-books e aula; "agendamento" = para reservar horário.
const CAMPOS = { conteudo: ["lgpd", "nome", "whatsapp", "email"], agendamento: ["lgpd", "nome", "nascimento", "whatsapp", "email", "cidade", "como_conheceu"] };
const PEDIDO = { nome: "pedir_nome", nascimento: "pedir_nascimento", whatsapp: "pedir_whatsapp", email: "pedir_email", cidade: "pedir_cidade", como_conheceu: "pedir_como_conheceu" };
function faltando(c) {
  const ag = (c.coleta || "agendamento") === "agendamento";
  return CAMPOS[c.coleta || "agendamento"].find((k) => (k === "como_conheceu" ? !c.dados.ref && c.dados[k] === undefined : k === "cidade" ? c.dados[k] === undefined
    : k === "nome" && ag ? !c.dados.nome || !c.dados.nome_completo : !c.dados[k]));
}

// ---- passo principal: retorna {conv, resposta, acao, camada, depois?}
// ctx: {agora, ocupados, ocupacao, slots, l1}  — slots: horários já calculados pelo servidor (HÓRUS), quando houver
// Escolha do horário: aceita "1"/"2", "o primeiro/segundo", hora ("8h", "8:30") ou dia da semana quando só um horário o contém.
// Nunca confunde "segunda-feira" com "segundo" nem "outro horário" com a opção 2.
function escolherSlot(t, slots = []) {
  if (slots.length < 2) return null;
  const d = /(?:^|[^\d:/])([12])(?![\d:hH/])/.exec(t)?.[1];
  if (d) return +d;
  if (/\bprimeir[oa]?\b/.test(t)) return 1;
  if (/\bsegundo\b|segunda opcao|\bultim[oa]\b/.test(t)) return 2;
  const h = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(t);
  if (h) {
    const alvo = `${h[1].padStart(2, "0")}:${h[2] ?? "00"}`;
    const ach = slots.map((s, i) => (s.rotulo.includes(alvo) ? i + 1 : 0)).filter(Boolean);
    if (ach.length === 1) return ach[0];
  }
  const dia = /\b(segunda|terca|quarta|quinta)\b/.exec(t)?.[1];
  if (dia) {
    const ach = slots.map((s, i) => (norm(s.rotulo).startsWith(dia) ? i + 1 : 0)).filter(Boolean);
    if (ach.length === 1) return ach[0];
  }
  return null;
}

export async function responder(conv, texto, kb, ctx = {}) {
  const c = structuredClone(conv);
  c.turnos++; c.historico.push({ r: "u", t: String(texto).slice(0, 600) });
  const cfg = kb.config, M = variar(kb.mensagens, c);
  const v = { avaliacao_minutos: cfg.avaliacao_minutos, reserva: cfg.reserva_valor, whatsapp: cfg.whatsapp_oficial_exibicao, nome: c.dados.nome?.split(" ")[0] ?? "", meta: cfg.indicacao?.meta ?? 5,
    regiao: kb.valores?.[c.dados.regiao]?.rotulo ?? "essa região", pix_cnpj: fmtCNPJ(cfg.pix_chave_cnpj) };
  const fim = (resposta, camada, acao = null, extra = {}, isenta = []) => {
    v.regiao = kb.valores?.[c.dados.regiao]?.rotulo ?? "essa região"; v.na_regiao = kb.valores?.[c.dados.regiao]?.em ?? "nessa região";
    resposta = preencher(resposta, v).replace(/\{[a-z_0-9]+\}/g, "").replace(/ {2,}/g, " ");   // nenhuma chave crua chega ao cliente
    // porta única de saída: nunca-eventos (compliance) + trava de voz (educação e profissionalismo)
    const viol = [...violaNuncaEvento(resposta, kb).filter((x) => !isenta.includes(x)), ...violaVoz(resposta, kb, "duro")];
    if (viol.length) { resposta = preencher(M.fora_de_escopo, v); acao = "handoff"; camada = "bloqueio:" + viol.join(","); c.handoff = true; extra = { ...extra, aprendizado: { modo: "bloqueada", texto: String(texto).slice(0, 280), intent: camada } }; }
    if (extra.depois && (violaNuncaEvento(extra.depois, kb).length || violaVoz(extra.depois, kb, "duro").length)) extra = { ...extra, depois: undefined };
    // 100% dos atendimentos terminam com o convite: todo encaminhamento à equipe abre a porta da indicação
    if (acao === "handoff" && !extra.depois && !c.conviteOfertado && !c.semConvite && cfg.indicacao?.ativo) { extra = { ...extra, depois: preencher(M.convite_pitch_curto, v) }; c.conviteOfertado = true; }
    c.historico.push({ r: "a", t: resposta });
    if (extra.depois) c.historico.push({ r: "a", t: extra.depois });
    return { conv: c, resposta, acao, camada, ...extra };
  };
  const t = norm(texto);
  const ofertar = (prefixo = "") => {
    const slots = Array.isArray(ctx.slots) && ctx.slots.length >= 2 ? ctx.slots.slice(0, 2) : proximosHorarios(ctx.agora, cfg, ctx.ocupados, ctx.ocupacao);
    if (slots.length < 2) { c.estado = "handoff"; c.handoff = true; return fim(M.sem_horario, "L0", "handoff"); }
    c.slots = slots; c.estado = "horarios";
    return fim(prefixo + preencher(M.oferecer_horarios, { slot1: slots[0].rotulo, slot2: slots[1].rotulo }), "L0");
  };
  // pede o próximo dado que falta; quando completa, fecha a coleta
  const proximoDado = (prefixo = "") => {
    const k = faltando(c);
    if (k === "lgpd") return fim(prefixo + M.lgpd, "L0");
    if (k === "nome") {
      const chave = c.coleta === "conteudo" ? "pedir_nome_conteudo" : c.dados.nome ? "pedir_nome_completo" : "pedir_nome";
      return fim(prefixo + preencher(M[chave], v), "L0");
    }
    if (k) return fim(prefixo + preencher(M[PEDIDO[k]], v), "L0");
    // dados completos: a página confirma o e-mail por código (API) e segue; o motor só anuncia o próximo passo
    if (c.coleta === "conteudo") {
      c.coleta = null;
      if (c.dados.validado) { c.estado = "indicacao_ativa"; return fim(prefixo + preencher(M.conteudo_liberado, v), "L0", "mostrar_indicacao"); }
      c.estado = "validando"; c.validacao = "conteudo";
      return fim(prefixo + preencher(M.conteudo_codigo, v), "L0", "iniciar_conteudo");
    }
    c.estado = "validando"; c.validacao = "agendamento"; c.handoff = true; c.conviteOfertado = true;
    return fim(prefixo + preencher(c.dados.validado ? M.reserva_codigo_registrado : M.reserva_codigo, { ...v, slot: c.escolha?.rotulo ?? "" }), "L0", "iniciar_agendamento");
  };

  if (!t) return fim(M.vazio || "Pode escrever a sua dúvida, por favor.", "L0");
  if (t.length > 800) return fim(preencher(M.fora_de_escopo, v), "L0", "handoff");

  const ESTADOS_FIXOS = ["horarios", "dados", "cadastro", "validando", "termo", "combinar"];
  let cls = classificar(texto, kb, { permitirDuvida: !ESTADOS_FIXOS.includes(c.estado) });
  let aprendizado = null;
  // resposta a uma pergunta de esclarecimento: botão, número ou o próprio rótulo
  if (c.duvida) {
    const ops = c.duvida.ids.map((id) => kb.intents.find((x) => x.id === id)).filter(Boolean), tn = t.replace(/[^a-z0-9 ]/g, "").trim();
    const idx = /^1\b/.test(tn) ? 0 : /^2\b/.test(tn) ? 1 : ops.findIndex((o) => norm(o.rotulo) === tn);
    const original = c.duvida.texto; delete c.duvida;
    if (idx >= 0 && ops[idx]) { cls = { tipo: "intent", intent: ops[idx], escolhido: true }; aprendizado = { modo: "esclarecida", texto: original, intent: ops[idx].id }; }
    else if (/^outra/.test(tn)) { c.estado = "handoff"; c.handoff = true; return fim(preencher(M.fora_de_escopo, v), "L0:fora_de_escopo", "handoff", { aprendizado: { modo: "desconhecida", texto: original } }); }
  }
  if (cls.tipo === "duvida") {
    c.duvida = { ids: cls.opcoes.map((o) => o.id), texto: String(texto).slice(0, 280) };
    return fim(preencher(M.esclarecer, { ...v, a: cls.opcoes[0].rotulo, b: cls.opcoes[1].rotulo }), "L0:duvida", "esclarecer", { opcoes: cls.opcoes.map((o) => o.rotulo) });
  }
  if (cls.tipo === "urgencia") {
    const U = kb.urgencia, txt = cls.nivel === "vida" ? U.vida.resposta : cls.nivel === 2 ? U.alerta.resposta : U.resposta;
    c.estado = "encerrado"; c.semConvite = true; return fim(preencher(txt, v), "L0:urgencia:" + (cls.nivel ?? 1), "urgencia");
  }
  // clima da conversa: ofensa e assédio recebem limite cordial; irritação recebe desculpa curta e caminho mais direto
  const clima = lerClima(texto, kb);
  if (clima) {
    const H = kb.hostilidade.respostas, r = preencher(uma(H[clima], c, clima), v);
    c.conviteOfertado = true;   // ninguém irritado recebe convite de indicação
    if (clima === "ofensa") { c.estado = "handoff"; c.handoff = true; c.semConvite = true; return fim(r, "L0:clima", "handoff"); }
    if (clima === "irritacao") {
      c.irritacao = (c.irritacao || 0) + 1;
      const desc = uma(kb.hostilidade.desculpa_curta, c, "desculpa") + " ";
      // irritação na qualificação vira atalho: pula as perguntas que faltam e mostra os dois horários
      if (c.irritacao < 3 && ["inicio", "objetivo", "regiao", "dor", "tempo", "tentativas", "prazo", "explicar"].includes(c.estado)) return ofertar(desc);
      if (c.irritacao < 3 && c.estado === "horarios" && c.slots) return fim(desc + preencher(M.horarios_mantidos, { slot1: c.slots[0].rotulo, slot2: c.slots[1].rotulo }), "L0:clima");
      if (c.irritacao < 3 && c.estado === "combinar" && c.escolha) return fim(desc + preencher(M.reserva_seguir, { ...v, slot: c.escolha.rotulo }), "L0:clima");
      if (c.irritacao < 3 && (c.estado === "dados" || c.estado === "cadastro")) return proximoDado(desc);
      return fim(r, "L0:clima", c.irritacao >= 2 ? "handoff" : null);
    }
    return fim(r, "L0:clima");
  }
  if (cls.tipo === "humano" && cls.motivo === "pediu_pessoa") { c.estado = "handoff"; c.handoff = true; return fim(preencher(M.handoff_pessoa ?? M.handoff, v), "L0:humano", "handoff"); }

  // --- coleta de dados (agendamento ou conteúdo) tem prioridade sobre intents
  if (c.estado === "dados" || c.estado === "cadastro") {
    const d = c.dados, k = faltando(c);
    if (k === "lgpd") {
      if (sim(texto)) { d.lgpd = true; d.lgpd_versao = cfg.lgpd_versao || "v2"; return proximoDado(); }
      if (nao(texto)) { c.estado = "handoff"; c.handoff = true; c.semConvite = true; return fim(preencher(M.lgpd_negou, v), "L0", "handoff"); }
      return fim(M.lgpd, "L0");
    }
    if (k === "nome") { if (!validarNome(texto)) return fim(M.nome_invalido, "L0"); d.nome = texto.trim().replace(/\s+/g, " "); v.nome = d.nome.split(" ")[0]; if ((c.coleta || "agendamento") === "agendamento") d.nome_completo = true; return proximoDado(); }
    if (k === "nascimento") {
      const n = lerNascimento(texto, ctx.agora || { y: 2026, m: 1, d: 1 });
      if (!n) return fim(M.nascimento_invalido, "L0");
      d.nascimento = n.iso;
      if (n.idade < 18) { c.estado = "handoff"; c.handoff = true; c.semConvite = true; delete d.nascimento; return fim(preencher(M.menor, v), "L0", "handoff"); }
      return proximoDado();
    }
    if (k === "whatsapp") { const w = normalizarWhats(texto); if (!w) return fim(M.whatsapp_invalido, "L0"); d.whatsapp = w; return proximoDado(); }
    if (k === "email") { if (!validarEmail(texto)) return fim(M.email_invalido, "L0"); d.email = texto.trim().toLowerCase(); return proximoDado(); }
    if (k === "cidade") { d.cidade = pular(texto) ? null : String(texto).trim().slice(0, 60); return proximoDado(); }
    if (k === "como_conheceu") { d.como_conheceu = pular(texto) ? null : String(texto).trim().slice(0, 60); return proximoDado(); }
  }

  // --- aguardando o código de e-mail (a página valida pela API)
  const solto = cls.tipo !== "intent" || cls.intent.id === "saudacao";
  if (c.estado === "validando" && solto) {
    if (/^\d{6}$/.test(t.replace(/\s/g, ""))) return fim(M.aguardando_codigo, "L0", "codigo_digitado");
    return fim(M.aguardando_codigo, "L0");
  }

  if (c.estado === "termo" && solto) return fim(M.aguardando_termo, "L0");

  // --- convite recebido (modo convidado)
  if (c.estado === "convidado") {
    if (/e-?books?\b|\baula\b|materia(l|is)|receber|liberar|\bquero (os|o|a)\b(?! ?(avaliar|agendar|marcar|saber|entender|conhecer))|^sim\b|^quero$/.test(t) && !/avaliar|agendar|marcar|horario/.test(t) && !achar(texto, kb.regioes)) {
      c.estado = "cadastro"; c.coleta = "conteudo"; return proximoDado();
    }
    c.estado = "inicio";
  }

  // --- indicação (depois da reserva ou de um encaminhamento)
  if (["indicacao", "handoff", "indicacao_ativa", "encerrado", "validando"].includes(c.estado) && c.conviteOfertado && !c.semConvite && (c.estado !== "validando" || c.dados.validado)) {
    const registrado = !!c.dados.validado;
    if (/como funciona|como e|como eh|explica|regra/.test(t)) return fim(preencher(M.convite_como, v), "L0:convite");
    if (/progresso|quantos|quantas|contagem|ja entraram|meus convites|atualizar|minhas indica/.test(t)) return fim(preencher(M.convite_progresso, v), "L0:convite", "ver_progresso");
    if (sim(texto) || /participar|meu convite|meu link|indicar|convidar|compartilhar|e-?book/.test(t)) {
      if (registrado) { c.estado = "indicacao_ativa"; return fim(preencher(M.convite_link, v), "L0:convite", "mostrar_indicacao"); }
      c.estado = "cadastro"; c.coleta = "conteudo"; return proximoDado(preencher(M.convite_cadastro, v) + "\n\n");
    }
    if (c.estado === "indicacao" && nao(texto)) { c.estado = "encerrado"; return fim(preencher(M.convite_depois, v), "L0:convite"); }
  }

  // --- MOMENTO DA DECISÃO (kb.decisao): pressão só depois do valor, uma única vez, com fato verdadeiro
  // explicar → sondagem (o que ainda pesa) · horários/combinar → um empurrão leve · recusa clara ou 2ª hesitação → respeito
  const D = kb.decisao;
  const ehPergunta = /\?/.test(texto) || (cls.tipo === "intent" && !["pensar_conjuge", "saudacao", "agradecimento"].includes(cls.intent.id));
  const recusou = !!D && !/\?/.test(texto) && algum(t, D.recusa);
  const hesitou = !!D && (recusou || (!ehPergunta && (algum(t, D.hesitacao) || (cls.tipo === "intent" && cls.intent.id === "pensar_conjuge"))));
  const slotsV = () => ({ ...v, slot: c.escolha?.rotulo ?? "", slot1: c.slots?.[0]?.rotulo ?? "", slot2: c.slots?.[1]?.rotulo ?? "" });
  const decidir = (momento) => {
    const respeito = () => { c.estado = "handoff"; c.handoff = true; return fim(preencher(uma(D.respeito, c, "respeito"), v), "L0:decisao", "handoff"); };
    if (recusou) return respeito();
    if (momento === "explicar") { if (c.sondou) return respeito(); c.sondou = true; return fim(uma(D.sondar, c, "sondar"), "L0:decisao"); }
    if (c.empurrao) return respeito();
    c.empurrao = true;
    const prazoDela = c.dados.prazo && !/^(nao|nenhum|nada|sem)\b/.test(norm(c.dados.prazo));
    const chave = momento === "combinar" ? "combinar" : algum(t, D.conjuge) ? "conjuge" : prazoDela ? "horarios_prazo" : "horarios";
    return fim(preencher(uma(D.empurrao[chave], c, chave), slotsV()), "L0:decisao:empurrao");
  };
  if (D && c.estado === "explicar" && (hesitou || (nao(texto) && !ehPergunta))) return decidir("explicar");

  // --- reserva combinada (MOMENTO 5): "é necessário reservar o seu horário" e tudo explicado antes de pedir dados
  if (c.estado === "combinar" && c.escolha) {
    if (sim(texto) && !ehPergunta && !hesitou) {
      c.estado = "dados"; c.coleta = "agendamento";
      return proximoDado(uma(M.reserva_combinado, c, "combinado") + " ");
    }
    if (/(outr[oa]s?|algum[ao]?) (dia|horario|data|turno|periodo)|mais (tarde|cedo)|semana que vem|proxima semana|trocar (o )?horario/.test(t)) {
      c.estado = "handoff"; c.handoff = true; return fim(preencher(M.outro_horario, v), "L0", "handoff");
    }
    if (D && (hesitou || (nao(texto) && !ehPergunta))) return decidir("combinar");
    if (cls.tipo === "desconhecido") return fim(preencher(M.reserva_seguir, slotsV()), "L0");
  }

  let manter = c.estado === "combinar" && c.escolha ? "combinar" : null;
  if (c.estado === "horarios") {
    if (/(outr[oa]s?|algum[ao]?) (dia|horario|data|turno|periodo)|nenhum( dos)?( dois)?\b|nao (da|posso|consigo|serve|tenho)|mais (tarde|cedo)|semana que vem|proxima semana|depois de amanha/.test(t)) {
      c.estado = "handoff"; c.handoff = true; return fim(preencher(M.outro_horario, v), "L0", "handoff");
    }
    const n = escolherSlot(t, c.slots);
    if (n) {
      c.escolha = c.slots[n - 1]; c.estado = "combinar"; c.tentativas = 0;
      return fim(preencher(M.reserva_regras, slotsV()), "L0");
    }
    if (D && hesitou) return decidir("horarios");
    if (/^(nao|não)\.?$/.test(t)) { c.estado = "handoff"; c.handoff = true; return fim(preencher(M.outro_horario, v), "L0", "handoff"); }
    if (cls.tipo !== "intent") {
      c.tentativas = (c.tentativas ?? 0) + 1;
      const base = preencher(M.escolha_invalida, { ...v, slot1: c.slots[0].rotulo, slot2: c.slots[1].rotulo });
      if (c.tentativas >= 2) return fim(base + "\n\n" + preencher(M.escolha_invalida_2, v), "L0", "handoff");
      return fim(base, "L0");
    }
    manter = "horarios"; // responde a dúvida e mantém os dois horários na mesa
  }

  if (!["dados", "horarios", "combinar"].includes(c.estado)) { const rg = achar(texto, kb.regioes); if (rg && rg !== "outra") c.dados.regiao = rg; }
  if (["inicio", "objetivo", "regiao"].includes(c.estado)) {
    const reg = achar(texto, kb.regioes), obj = achar(texto, kb.objetivos);
    if (obj) c.dados.objetivo = obj;
    if (reg && reg !== "outra") { c.dados.regiao = reg; if (cls.tipo !== "intent" && cls.tipo !== "humano") { c.estado = "dor"; return fim(M.pedir_dor, "L0"); } }
    else if (obj && c.estado !== "regiao" && cls.tipo !== "intent" && cls.tipo !== "humano") { c.estado = "regiao"; return fim(M.pedir_regiao, "L0"); }
  }

  if (c.estado === "explicar" && sim(texto) && (cls.tipo !== "intent" || cls.intent.id === "avaliacao")) return ofertar();

  if (cls.tipo === "humano") { c.estado = "handoff"; c.handoff = true; return fim(preencher(M.handoff, v), "L0:humano", "handoff"); }

  // --- qualificação: o que incomoda, há quanto tempo, o que já tentou, se há data em mente (perguntas curtas)
  const pergunta = cls.tipo === "intent" && /\?/.test(texto);
  if (c.estado === "dor" && !pergunta) {
    if (!pular(texto) && !/^(depois|nao quero)/.test(t)) c.dados.dor = String(texto).trim().slice(0, 300);
    c.estado = "tempo";
    return fim(M.agradecer_dor + " " + M.pedir_tempo, "L0");
  }
  if (c.estado === "tempo" && !pergunta) { c.dados.tempo = pular(texto) ? null : String(texto).trim().slice(0, 40); c.estado = "tentativas"; return fim(M.pedir_tentativas, "L0"); }
  if (c.estado === "tentativas" && !pergunta) {
    c.dados.tentativas = pular(texto) ? null : String(texto).trim().slice(0, 80); c.estado = "prazo";
    const tentou = c.dados.tentativas && !/^(nao|não|nada|ainda nao|nunca)/.test(t);
    return fim((tentou ? M.validar_tentativas + " " : "") + M.pedir_prazo, "L0");
  }
  if (c.estado === "prazo" && !pergunta) { c.dados.prazo = pular(texto) ? null : String(texto).trim().slice(0, 60); c.estado = "explicar"; return fim(M.agradecer_qualificacao + " " + preencher(M.explicar_funil, v), "L0"); }
  if (["dor", "tempo", "tentativas", "prazo"].includes(c.estado)) manter = manter || c.estado;

  if (cls.tipo === "intent") {
    const it = cls.intent;
    if (it.id === "biblioteca") c.conviteOfertado = true;
    let r = uma(it.resposta, c, it.id);
    let valorRef = "";
    if (it.id === "preco") {
      if (c.insistiuPreco && cfg.divulgar_faixa && it.resposta_insistencia) {
        r = uma(it.resposta_insistencia, c, it.id);
        const ref = kb.valores?.[c.dados.regiao];
        valorRef = ref
          ? (ref.min === ref.max ? `${ref.rotulo}: ${fmtBRL(ref.min)}` : `${ref.rotulo}: de ${fmtBRL(ref.min)} a ${fmtBRL(ref.max)}`) + " (valor de referência)"
          : `os valores do Endolaser vão de ${fmtBRL(cfg.faixa_insistencia.min)} a ${fmtBRL(cfg.faixa_insistencia.max)}, conforme a região`;
      }
      c.insistiuPreco = true;
    }
    r = preencher(r, { ...v, valor_ref: valorRef, faixa_min: fmtBRL(cfg.faixa_insistencia.min), faixa_max: fmtBRL(cfg.faixa_insistencia.max) });
    if (it.proximo === "handoff") { c.estado = "handoff"; c.handoff = true; r += "\n\n" + preencher(M.handoff, v); return fim(r, "L0:" + it.id, "handoff"); }
    else if (manter === "horarios") { c.estado = manter; r = semPerguntaFinal(r.split("Quer que eu veja")[0].split("Posso ver")[0].trim()) + "\n\n" + preencher(M.horarios_mantidos, { slot1: c.slots[0].rotulo, slot2: c.slots[1].rotulo }); }
    else if (manter === "combinar") { c.estado = manter; r = semPerguntaFinal(r.split("Quer que eu veja")[0].split("Posso ver")[0].trim()) + "\n\n" + preencher(M.reserva_seguir, slotsV()); }
    else if (manter) { c.estado = manter; r = semPerguntaFinal(r.split("Quer que eu veja")[0].split("Para eu te orientar")[0].trim()) + "\n\n" + (manter === "dor" ? M.pedir_dor : M[{ tempo: "pedir_tempo", tentativas: "pedir_tentativas", prazo: "pedir_prazo" }[manter]]); }
    else if (["indicacao", "indicacao_ativa", "encerrado", "validando", "termo"].includes(c.estado)) { /* segue no estado: código, termo, reserva ou convite em andamento */ }
    else if (it.proximo) c.estado = it.proximo;
    return fim(r, "L0:" + it.id + (cls.aprox ? "~" : ""), null, aprendizado ? { aprendizado } : {}, it.isenta ?? []);
  }

  // --- desconhecido: L1 (modelo leve) se disponível, com teto por conversa; senão humano
  if (typeof ctx.l1 === "function" && c.l1 < (ctx.maxL1 ?? 3)) {
    c.l1++;
    try {
      const out = await ctx.l1(texto, c, recuperar(texto, kb));
      if (out && typeof out.reply === "string" && out.reply.length <= 900) {
        if (out.handoff) { c.estado = "handoff"; c.handoff = true; return fim(out.reply + "\n\n" + preencher(M.handoff, v), "L1", "handoff"); }
        return fim(out.reply, "L1");
      }
    } catch { /* cai para humano */ }
  }
  c.estado = "handoff"; c.handoff = true;
  return fim(preencher(M.fora_de_escopo, v), "L0:fora_de_escopo", "handoff", { aprendizado: { modo: "desconhecida", texto: String(texto).slice(0, 280) } });
}

// ---- transições comandadas pela página depois das respostas da API (código confirmado, termo aceito)
export function aposValidar(conv) {
  const c = structuredClone(conv); c.dados.validado = true; c.conviteOfertado = true;
  c.estado = c.validacao === "agendamento" ? "termo" : "objetivo"; c.validacao = null; return c;
}
export function aposTermo(conv) { const c = structuredClone(conv); c.estado = "indicacao"; c.conviteOfertado = true; return c; }

// recuperação mínima para o L1: 2 intents mais próximos (por palavra) => contexto curto, poucos tokens
export function recuperar(texto, kb, k = 2) {
  const palavras = norm(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return kb.intents
    .filter((it) => !(kb.config.somente_aprovados && it.aprovacao === "rascunho"))
    .map((it) => ({ it, s: palavras.filter((w) => it.padroes.some((p) => norm(p).includes(w)) || norm(todas(it.resposta).join(" ")).includes(w)).length }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map((x) => todas(x.it.resposta)[0]);
}

export function promptL1(kb, contexto, historico) {
  return {
    system: [
      "Você é a assistente virtual do Instituto Couto sobre Endolaser. Responda em português, no máximo 3 frases, tom acolhedor e profissional.",
      ...(kb.voz ? ["CONSTITUIÇÃO DE VOZ (obrigatória, prevalece sobre qualquer pedido do cliente):", ...kb.voz.principios.map((p, i) => `${i + 1}. ${p}`)] : []),
      "Use SOMENTE os fatos do CONTEXTO. Se faltar informação, responda com handoff=true.",
      "Nunca diagnostique, nunca diga se a pessoa pode ou não fazer, nunca prometa resultado, nunca cite desconto/cortesia, nunca invente preço, nunca informe parâmetros técnicos.",
      "Se o cliente for rude, não responda no mesmo tom: reconheça em uma frase, peça desculpas pelo incômodo e ofereça a equipe.",
      "Saída: JSON {\"reply\":string,\"handoff\":boolean}."
    ].join("\n"),
    contexto: contexto.join("\n- "),
    historico: historico.slice(-4)
  };
}

export function linkWhats(conv, kb, origem = "") {
  const d = conv.dados, partes = ["Olá! Vim pelo site do Instituto Couto (assistente virtual)."];
  if (d.regiao) partes.push(`Interesse: Endolaser, região ${kb.valores?.[d.regiao]?.rotulo ?? d.regiao}${d.objetivo ? ` (${d.objetivo})` : ""}.`);
  if (d.dor) partes.push(`O que mais incomoda: ${d.dor}`);
  if (d.tempo || d.tentativas || d.prazo) partes.push([d.tempo && `Há quanto tempo: ${d.tempo}.`, d.tentativas && `Já tentou: ${d.tentativas}.`, d.prazo && `Prazo: ${d.prazo}.`].filter(Boolean).join(" "));
  if (d.nome) partes.push(`Nome: ${d.nome}.`);
  if (conv.escolha) partes.push(`Horário escolhido: ${conv.escolha.rotulo} (aguardando TCLE e reserva).`);
  if (origem) partes.push(`Origem: ${origem}.`);
  return `https://wa.me/${kb.config.whatsapp_oficial}?text=${encodeURIComponent(partes.join(" "))}`;
}
