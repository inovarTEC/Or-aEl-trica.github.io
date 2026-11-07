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
const { abrirPendencia, STEP_PONTOS } = loadTs(resolve(ROOT, 'lib/navegacao.ts'));

let n = 0;
const id = () => `id${++n}`;
const ponto = (t = 'T10') => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t }] });
const room = (extra = {}) => ({
  id: id(), base: 'Cômodo', nome: 'Cômodo', c: '3', l: '3', medE: false,
  via: '', dq: '1', dd: '', dr: '', dqE: false, ddE: false, drE: false,
  dpad: '1.5', dpadE: true, pontos: [], luzes: [], comandos: [], caixas: [],
  luzAuto: true, inst: '', pe: '2.8', obs: '', ...extra,
});
/** Luzes com interruptor simples cada (como o wizard cria). */
const estado = (rooms) => ({ imovel: 'Casa', obra: 'Reforma', cobertura: '', rede: '', rooms, equips: [] });

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

teste('abrirPendencia com roomId seleciona o cômodo e vai para a etapa', () => {
  const chamadas = [];
  const store = {
    setActiveRoomId: (v) => chamadas.push(['room', v]),
    setActiveEquipId: (v) => chamadas.push(['equip', v]),
    setVeioDaPrevia: (v) => chamadas.push(['previa', v]),
    setStep: (v) => chamadas.push(['step', v]),
  };
  abrirPendencia({ step: STEP_PONTOS, roomId: 'abc' }, store);
  assert.deepEqual(chamadas.find((c) => c[0] === 'room'), ['room', 'abc']);
  assert.deepEqual(chamadas.find((c) => c[0] === 'step'), ['step', STEP_PONTOS]);
  assert.ok(!chamadas.some((c) => c[0] === 'equip'));
});

teste('distInterna + distTrajeto de um cômodo = contribuição dele ao eletroduto', () => {
  const r = room({ dq: '6', pontos: [ponto(), ponto()] });
  const t = calcTotais(estado([r]));
  const c = t.porComodo[0];
  assert.ok(c.distTrajeto > 0);
  assert.equal(Math.round((c.distInterna + c.distTrajeto) * 10) / 10, t.distEletroduto);
});

let falhas = 0;
for (const [nome, fn] of testes) {
  try { fn(); console.log(`OK    ${nome}`); }
  catch (e) { falhas++; console.log(`FALHA ${nome}\n      ${e.message}`); }
}
console.log(`\n${testes.length - falhas}/${testes.length} testes passaram`);
process.exit(falhas ? 1 : 0);
