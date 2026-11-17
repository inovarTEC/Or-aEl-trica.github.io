/*
 * montarCircuitos: entrada única da divisão de circuitos (igual a resolverUnidades + circuitosBrutos).
 * Rodar: node tests/circuitos-lista.test.mjs
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

const { montarCircuitos, resolverUnidades, circuitosBrutos } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const T = Object.fromEntries(ROOM_TEMPLATES.map((x, i) => [x.label, i]));
const casa = () => {
  const rooms = [];
  for (const [tpl, nome, c, l] of [['Sala típica', 'Sala', '5', '4'], ['Cozinha típica', 'Cozinha', '4', '3'], ['Quarto típico', 'Quarto', '3.5', '3'], ['Quarto típico', 'Quarto 2', '3.5', '3'], ['Banheiro típico', 'Banheiro', '2.5', '2'], ['Área de serviço', 'Serviço', '3', '2'], ['Personalizado', 'Edícula', '4', '3']])
    rooms.push(novoComodo(ROOM_TEMPLATES[T[tpl]], rooms, { nome, c, l }));
  return rooms;
};
const cfgManual = (rooms) => ({ modo: 'manual', unico: [rooms[0].id], grupos: [{ id: 'g', rooms: [rooms[2].id, rooms[3].id], dists: ['', '3'] }] });

t('montarCircuitos devolve o mesmo que resolverUnidades + circuitosBrutos, em todos os modos', () => {
  const rooms = casa();
  for (const cfg of [{ modo: 'norma', unico: [], grupos: [] }, { modo: 'economico', unico: [], grupos: [] }, { modo: 'maximo', unico: [], grupos: [] }, cfgManual(rooms)]) {
    const a = montarCircuitos(rooms, cfg);
    const r = resolverUnidades(rooms, cfg);
    assert.deepEqual(a.avisos, r.avisos);
    assert.deepEqual(a.circuitos, circuitosBrutos(r.unidades));
  }
});
t('modo forçado funciona como antes (cards de comparação)', () => {
  const rooms = casa();
  const a = montarCircuitos(rooms, { modo: 'norma', unico: [], grupos: [] }, 'economico');
  assert.deepEqual(a.circuitos, circuitosBrutos(resolverUnidades(rooms, undefined, 'economico').unidades));
});
t('todo cômodo tem unidade, mesmo sem carga (usado no agrupamento dos equipamentos)', () => {
  const rooms = casa();
  const a = montarCircuitos(rooms, cfgManual(rooms));
  for (const r of rooms) assert.ok(a.unidadeDoComodo.has(r.id), r.nome);
  for (const c of a.circuitos) assert.ok(c.rooms.every((r) => a.unidadeDoComodo.get(r.id) === c.unidade));
});
t('sem cômodos: lista vazia, sem erro', () => {
  const a = montarCircuitos([], undefined);
  assert.equal(a.circuitos.length, 0); assert.equal(a.unidadeDoComodo.size, 0);
});
console.log(`${ok} testes OK`);
