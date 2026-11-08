/*
 * Testes do cálculo da prévia (lib/server/calculator.ts) — sem dependências extras.
 * Rodar: node tests/calc.test.mjs
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

const { resumoComodo, caixaPorModulos, modulosSw } = loadTs(resolve(ROOT, 'lib/resumo-comodo.ts'));

let n = 0;
const id = () => `id${++n}`;
const ponto = (t, cx = '4x2') => ({ id: id(), h: 'baixa', d: '', cx, mods: [{ id: id(), t }] });
const sw = (tom = '', cx = '4x2') => ({ id: id(), h: 'media', d: '', tom, cx });
let ok = 0;
const caso = (nome, fn) => { fn(); ok++; console.log('OK   ', nome); };

caso('1. Tomadas simples/dupla/tripla e USB', () => {
  const r = { pontos: [ponto('T10'), ponto('T10D'), ponto('T20T'), ponto('USB')], luzes: [], comandos: [] };
  const s = resumoComodo(r);
  assert.equal(s.nTomadas, 3); assert.equal(s.nModulos, 7); // pontos (NBR) x módulos físicos assert.equal(s.nCaixas4x2, 4);
});
caso('2. Interruptores, tomada junto e caixas', () => {
  const l1 = { id: 'L1', d: '', cx: 'Redonda' }, l2 = { id: 'L2', d: '', cx: 'Redonda' }, l3 = { id: 'L3', d: '', cx: 'Redonda' };
  const r = { pontos: [], luzes: [l1, l2, l3], comandos: [
    { id: 'c1', t: 'IS', luzes: ['L1'], sws: [sw('T10D')] },
    { id: 'c2', t: 'IP', luzes: ['L2'], sws: [sw(), sw('T20D', '4x4')] },
    { id: 'c3', t: 'II', luzes: [], sws: [sw(), sw(), sw()] },
  ] };
  const s = resumoComodo(r);
  assert.equal(s.nInterruptores, 3); assert.deepEqual([s.nIS, s.nIP, s.nII], [1, 1, 1]);
  assert.equal(s.nTomadas, 2); assert.equal(s.nCaixas4x2, 5); assert.equal(s.nCaixas4x4, 1);
  assert.deepEqual(s.pendencias, ['Interruptor 3 sem luz vinculada', 'Luz 3 sem interruptor']);
});
caso('3. Sugestão de caixa', () => {
  assert.equal(caixaPorModulos(3), '4x2'); assert.equal(caixaPorModulos(4), '4x4');
  assert.equal(modulosSw(''), 1); assert.equal(modulosSw('T10D'), 3); assert.equal(modulosSw('T20T'), 4);
});
console.log(`\n${ok}/3 testes passaram`);
