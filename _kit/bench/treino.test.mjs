// Casos acrescentados pelo treino diário (frase → intent esperado). Cada linha nova protege o que o chat aprendeu.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classificar } from "../motor/motor.mjs";
const kb = JSON.parse(readFileSync(new URL("../conhecimento/endolaser.json", import.meta.url)));
kb.config.somente_aprovados = true;
const CASOS = [
  ["qto custa o procedimeto?", "preco"],
  ["vai doer muito?", "dor_anestesia"],
  ["oi qual valor", "preco"],
];
test("treino diário: o que foi aprendido continua respondendo", () => {
  for (const [frase, id] of CASOS) assert.equal(classificar(frase, kb).intent?.id, id, frase);
});
