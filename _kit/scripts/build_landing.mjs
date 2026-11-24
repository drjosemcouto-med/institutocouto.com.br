// Gera landing/index.html (arquivo único): inlina a base de conhecimento, o motor e as imagens.
// Uso: node scripts/build_landing.mjs [--externo] [--producao]   (--producao: só intents aprovados respondem)
// env: API_BASE=https://script.google.com/macros/s/<id>/exec (backend Google Apps Script)
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../", import.meta.url), externo = process.argv.includes("--externo");
const producao = process.argv.includes("--producao");
let kb = readFileSync(new URL("conhecimento/endolaser.json", dir), "utf8");
// o texto do Termo vem do backend (fonte única: o mesmo texto entra no hash do aceite)
const gas = readFileSync(new URL("backend/gas/Code.js", dir), "utf8");
const termo = { versao: /termo_versao: '([^']+)'/.exec(gas)[1], clausulas: new Function("return " + /var TERMO = (\[[\s\S]*?\n\]);/.exec(gas)[1])() };
{ const o = JSON.parse(kb); o.config.termo = termo; if (producao) o.config.somente_aprovados = true; if (process.env.URL_BASE) o.config.url_base = process.env.URL_BASE; if (process.env.VIDEOAULA_URL) o.config.videoaula.url = process.env.VIDEOAULA_URL; kb = JSON.stringify(o); }
const motor = readFileSync(new URL("motor/motor.mjs", dir), "utf8").replace(/^export /gm, "");
const img = (n, mime) => (externo ? `img/${n}` : `data:${mime};base64,${readFileSync(new URL(`landing/img/${n}`, dir)).toString("base64")}`);
let html = readFileSync(new URL("landing/template.html", dir), "utf8");
const fonte = (n) => `data:font/woff2;base64,${readFileSync(new URL(`landing/fonts/${n}`, dir)).toString("base64")}`;
html = html.replaceAll("{{FONT_REG}}", fonte("crimson-Regular.woff2")).replaceAll("{{FONT_SEMI}}", fonte("crimson-SemiBold.woff2")).replaceAll("{{FAVICON}}", img("favicon.png", "image/png"))
  .replaceAll("{{IMG_CORPO}}", img("couto-corpo-inteiro.webp", "image/webp")).replaceAll("{{IMG_CORPO_M}}", img("couto-corpo-inteiro-m.webp", "image/webp"))
  .replaceAll("{{IMG_AUTORIDADE}}", img("couto-autoridade.webp", "image/webp")).replaceAll("{{IMG_LOGO}}", img("logo-ic.webp", "image/webp"))
  .replaceAll("{{CAPA_1}}", img("capa-contorno-sem-atalhos.webp", "image/webp")).replaceAll("{{CAPA_2}}", img("capa-pele-firme-em-qualquer-fase.webp", "image/webp"))
  .replaceAll("{{CAPA_3}}", img("capa-procedimento-estetico-seguro.webp", "image/webp"))
  .replace(/\{\{CAPA_G([1-5])\}\}/g, (_, n) => img(`capa-guia-${n}.webp`, "image/webp"))
  .replace(/\{\{GAL_([1-6])\}\}/g, (_, n) => img(`galeria-${n}.webp`, "image/webp"))
  .replace("/*APP*/", () => readFileSync(new URL("landing/app.js", dir), "utf8").replace("/*API*/", (process.env.API_BASE || "").replace(/\/$/, "")).replace(/<\/script/gi, "<\\/script"))
  .replace("/*KB*/", () => kb.replace(/</g, "\\u003c")).replace("/*MOTOR*/", () => motor.replace(/<\/script/gi, "<\\/script"));
// endereço público da página (canonical, og): SITE_BASE=https://... (padrão: domínio do Instituto)
if (process.env.SITE_BASE) html = html.replaceAll("https://institutocouto.com.br/endolaser/", process.env.SITE_BASE.replace(/\/$/, "") + "/endolaser/");
writeFileSync(new URL("landing/index.html", dir), html);
console.log("landing/index.html", html.length, "bytes", externo ? "(imagens externas)" : "(imagens inline)", process.env.API_BASE ? "API=" + process.env.API_BASE : "modo local");
