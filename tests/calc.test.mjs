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

const { calcTotais } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));

let n = 0;
const id = () => `id${++n}`;
const ponto = (t = 'T10') => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t }] });
const luz = () => ({ id: id(), d: '', cx: 'Redonda' });
const sw = (tom = '') => ({ id: id(), h: 'media', d: '', tom, cx: '4x2' });
const room = (extra = {}) => ({
  id: id(), base: 'Cômodo', nome: 'Cômodo', c: '3', l: '3', medE: false,
  via: '', dq: '1', dd: '', dr: '', dqE: false, ddE: false, drE: false,
  dpad: '1.5', dpadE: true, pontos: [], luzes: [], comandos: [], caixas: [],
  luzAuto: true, inst: '', pe: '2.8', obs: '', ...extra,
});
/** Luzes com interruptor simples cada (como o wizard cria). */
function comLuzes(r, qtd) {
  for (let i = 0; i < qtd; i++) {
    const l = luz();
    r.luzes.push(l);
    r.comandos.push({ id: id(), t: 'IS', luzes: [l.id], sws: [sw()] });
  }
  return r;
}
const estado = (rooms, equips = []) => ({ imovel: 'Casa', obra: 'Reforma', cobertura: '', rede: '', rooms, equips });
const r1 = (v) => Math.round(v * 10) / 10;
const soma = (arr, k) => r1(arr.reduce((a, x) => a + x[k], 0));

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

teste('1. Quarto 3×T10 + Banheiro 2×T10 = 5 tomadas', () => {
  const q = room({ nome: 'Quarto', pontos: [ponto(), ponto(), ponto()] });
  const b = room({ nome: 'Banheiro', pontos: [ponto(), ponto()] });
  assert.equal(calcTotais(estado([q, b])).totalTomadas, 5);
});

teste('2. Soma por cômodo = total (tomadas, caixas, eletroduto)', () => {
  const a = comLuzes(room({ pontos: [ponto(), ponto()], dq: '4' }), 1);
  const b = comLuzes(room({ pontos: [ponto(), ponto()], dq: '6' }), 1);
  const t = calcTotais(estado([a, b]));
  assert.equal(soma(t.porComodo, 'tomadas'), t.totalTomadas);
  assert.equal(soma(t.porComodo, 'caixas'), t.totalCaixas);
  assert.equal(r1(soma(t.porComodo, 'distInterna') + t.distTrunk), t.distEletroduto);
  assert.deepEqual(t.porComodo.map((c) => c.distTrajeto), [4, 6]);
});

teste('3. Dupla e tripla contam 1 ponto de tomada cada (NBR 5410 conta pontos)', () => {
  assert.equal(calcTotais(estado([room({ pontos: [ponto('T10D')] })])).totalTomadas, 1);
  assert.equal(calcTotais(estado([room({ pontos: [ponto('T10T')] })])).totalTomadas, 1);
  // interruptor paralelo/retorno: aguarda confirmação da regra elétrica
});

teste('4. Tomada na caixa do interruptor não cria caixa extra', () => {
  const l = luz();
  const r = room({ luzes: [l], comandos: [{ id: id(), t: 'IS', luzes: [l.id], sws: [sw('T10')] }] });
  const t = calcTotais(estado([r]));
  assert.equal(t.totalCaixas, 2); // caixa do interruptor (com a tomada) + caixa da luz
  assert.equal(t.totalTomadas, 1);
});

teste('5. Equipamento não soma eletroduto na prévia', () => {
  const r = comLuzes(room({ pontos: [ponto()], dq: '5' }), 1);
  const sem = calcTotais(estado([r])).distEletroduto;
  const eq = { id: id(), tipo: 'Chuveiro elétrico', room: r.id, pot: '5500', tens: '220V', dint: '', dist: '5', alim: '' };
  assert.equal(calcTotais(estado([r], [eq])).distEletroduto, sem);
});

teste('6. "Pelo caminho de outro" não duplica o trecho compartilhado', () => {
  const a = room({ nome: 'A', dq: '5' });
  const b = room({ nome: 'B', via: a.id, dq: '', dd: '5', dr: '2' });
  const c = room({ nome: 'C', via: a.id, dq: '', dd: '5', dr: '3' });
  const t = calcTotais(estado([a, b, c]));
  assert.equal(t.distTrunk, 10); // 5 + 2 + 3 — NÃO 10 + 3
  assert.equal(t.distEletroduto, r1(10 + soma(t.porComodo, 'distInterna')));
  assert.deepEqual(t.porComodo.map((x) => x.distTrajeto), [5, 7, 8]);
});

teste('7. Caso dos prints: Quarto 6 m internos + 5 m até o quadro = 11 m', () => {
  // Interno: 3 tomadas × 1,5 + 1 luz × 1,5 = 6,0 (1º interruptor sem distância — regra atual).
  // Total: 6,0 interno + 5,0 (dq, direto do quadro) = 11,0.
  const q = comLuzes(room({ nome: 'Quarto', base: 'Quarto', dq: '5', pontos: [ponto(), ponto(), ponto()] }), 1);
  const t = calcTotais(estado([q]));
  assert.equal(t.porComodo[0].distInterna, 6);
  assert.equal(t.distEletroduto, 11);
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try { fn(); console.log(`OK    ${nome}`); }
  catch (e) { falhas++; console.log(`FALHA ${nome}\n      ${e.message}`); }
}
console.log(`\n${testes.length - falhas}/${testes.length} testes passaram`);
process.exit(falhas ? 1 : 0);
