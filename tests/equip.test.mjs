/*
 * Testes dos equipamentos na prévia (calculator.ts) e da distância local (ponto-equip.ts) — sem dependências extras.
 * Rodar: node tests/equip.test.mjs
 * Usa o TypeScript do próprio projeto (devDependency) para transpilar o código REAL em memória.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const out = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  cache.set(file, m);
  m.require = (spec) => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return require(spec);
    const base = spec.startsWith('@/') ? resolve(ROOT, spec.slice(2)) : resolve(dirname(file), spec);
    for (const c of [base + '.ts', base + '.tsx', resolve(base, 'index.ts')]) if (existsSync(c)) return loadTs(c);
    throw new Error(`não achei ${spec} a partir de ${file}`);
  };
  m._compile(out, file);
  return m.exports;
}

const { calcTotais } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { distanciaEquip } = loadTs(resolve(ROOT, 'lib/ponto-equip.ts'));


let n = 0;
const id = () => `id${++n}`;
const room = (extra = {}) => ({
  id: id(), base: 'Cômodo', nome: 'Cômodo', c: '3', l: '3', medE: false,
  via: '', dq: '5', dd: '', dr: '', dqE: false, ddE: false, drE: false,
  dpad: '1.5', dpadE: true, pontos: [], luzes: [], comandos: [], caixas: [],
  luzAuto: true, inst: '', pe: '2.8', obs: '', ...extra,
});
const equip = (extra = {}) => ({ id: id(), tipo: 'Ar-condicionado', room: '', pot: '1400', tens: '220V', dint: '', dist: '', alim: '', ...extra });
const estado = (rooms, equips) => ({ imovel: 'Casa', obra: 'Reforma', cobertura: '', rede: '', rooms, equips });

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

teste('1. Equipamento cx 4x2 + T20 soma +1 caixa e +1 tomada', () => {
  const r = room();
  const base = calcTotais(estado([r], []));
  const t = calcTotais(estado([r], [equip({ room: r.id, cx: '4x2', ponto: 'T20' })]));
  assert.equal(t.totalCaixas, base.totalCaixas + 1);
  assert.equal(t.totalTomadas, base.totalTomadas + 1);
  assert.equal(t.porComodo[0].caixas, 1);
  assert.equal(calcTotais(estado([r], [equip({ room: r.id, cx: '4x2', ponto: 'T20D' })])).totalTomadas, 2);
});

teste('2. Equipamento sem cômodo entra no total, não no porComodo', () => {
  const r = room();
  const t = calcTotais(estado([r], [equip({ cx: '4x4', ponto: 'borne' })]));
  assert.equal(t.totalCaixas, 1);
  assert.equal(t.totalTomadas, 0);
  assert.equal(t.porComodo[0].caixas, 0);
});

teste('3. Dois equipamentos no mesmo cômodo = 2 caixas no porComodo', () => {
  const a = room(), b = room();
  const t = calcTotais(estado([a, b], [equip({ room: a.id, cx: '4x2', ponto: 'T20' }), equip({ room: a.id, cx: '4x4', ponto: 'borne' })]));
  assert.equal(t.porComodo[0].caixas, 2);
  assert.equal(t.porComodo[1].caixas, 0);
  assert.equal(t.totalCaixas, 2);
});

teste('4. Distância: direta > cômodo + dint > nenhuma (sem fallback de 10 m)', () => {
  const r = room({ dq: '5' });
  assert.deepEqual(distanciaEquip(equip({ dist: '8' }), [r]), { metros: 8, origem: 'direta' });
  assert.deepEqual(distanciaEquip(equip({ room: r.id, dint: '2' }), [r]), { metros: 7, origem: 'comodo' });
  assert.deepEqual(distanciaEquip(equip(), [r]), { metros: 0, origem: 'nenhuma' });
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try { fn(); console.log(`OK    ${nome}`); }
  catch (e) { falhas++; console.log(`FALHA ${nome}\n      ${e.message}`); }
}
console.log(`\n${testes.length - falhas}/${testes.length} testes passaram`);
process.exit(falhas ? 1 : 0);
