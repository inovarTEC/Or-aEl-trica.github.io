/*
 * Testes da remoção de cômodo no store (lib/store-cliente.ts) e do efeito no cálculo.
 * Rodar: node tests/remocao.test.mjs
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


// Navegador simulado: o store grava no localStorage a cada mudança.
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { calcTotais } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
let n = 0; const id = () => 'i' + (++n);
const room = (nome, x = {}) => {
  const luz = { id: id(), d: '', cx: 'Redonda' };
  return {
    id: id(), base: nome, nome, c: '4', l: '3', medE: false, via: '', dq: '8', dd: '', dr: '',
    dqE: false, ddE: false, drE: false, dpad: '1.5', dpadE: true,
    pontos: [{ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] }],
    luzes: [luz],
    comandos: [{ id: id(), t: 'IS', luzes: [luz.id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] }],
    caixas: [], luzAuto: true, inst: 'Embutida na parede', pe: '2.8', obs: '', ...x,
  };
};
const equip = (roomId, tipo = 'Chuveiro elétrico', pot = '5500') =>
  ({ id: id(), tipo, room: roomId, pot, tens: '220V', dint: '1', dist: '', alim: '' });

function montar() {
  useStore.getState().resetState();
  const sala = room('Sala');
  const banheiro = room('Banheiro');
  const quarto = room('Quarto', { via: banheiro.id, dd: '3', dr: '2' });
  const s = useStore.getState();
  s.setField('rede', 'Bifásico');
  [sala, banheiro, quarto].forEach((r) => s.addRoom(r));
  s.addEquip(equip(banheiro.id));
  s.addEquip(equip(banheiro.id, 'Aquecedor', '4500'));
  s.addEquip(equip(sala.id, 'Ar-condicionado', '1400'));
  s.setActiveRoomId(banheiro.id);
  return { sala, banheiro, quarto };
}

t('removeRoom tira o cômodo com seus pontos, luzes e comandos', () => {
  const { banheiro } = montar();
  const luzId = banheiro.luzes[0].id;
  useStore.getState().removeRoom(banheiro.id);
  const st = useStore.getState();
  assert.equal(st.rooms.length, 2);
  assert.ok(!st.rooms.some((r) => r.id === banheiro.id));
  // nenhum ponto, luz ou comando do cômodo removido sobra em outro lugar
  const pontos = st.rooms.flatMap((r) => r.pontos.map((p) => p.id));
  const luzes = st.rooms.flatMap((r) => r.luzes.map((l) => l.id));
  const refsLuz = st.rooms.flatMap((r) => r.comandos.flatMap((c) => c.luzes));
  const cmds = st.rooms.flatMap((r) => r.comandos.map((c) => c.id));
  assert.ok(!pontos.includes(banheiro.pontos[0].id));
  assert.ok(!luzes.includes(luzId));
  assert.ok(!refsLuz.includes(luzId));
  assert.ok(!cmds.includes(banheiro.comandos[0].id));
});

t('removeRoom apaga os equipamentos do cômodo e mantém os dos outros', () => {
  const { banheiro, sala } = montar();
  useStore.getState().removeRoom(banheiro.id);
  const eqs = useStore.getState().equips;
  assert.equal(eqs.length, 1);
  assert.equal(eqs[0].room, sala.id);
  assert.ok(!eqs.some((e) => e.room === banheiro.id || e.room === ''));
});

t('removeRoom limpa a rota "via" que passava pelo cômodo e o cômodo ativo', () => {
  const { banheiro, quarto } = montar();
  useStore.getState().removeRoom(banheiro.id);
  const st = useStore.getState();
  assert.equal(st.rooms.find((r) => r.id === quarto.id).via, '');
  assert.equal(st.activeRoomId, '');
});

t('removeRoom persiste no localStorage', () => {
  const { banheiro } = montar();
  useStore.getState().removeRoom(banheiro.id);
  const salvo = JSON.parse(mem.get('orca_v2')).dados;
  assert.ok(!salvo.rooms.some((r) => r.id === banheiro.id));
  assert.ok(!salvo.equips.some((e) => e.room === banheiro.id));
});

t('o cálculo não conta mais a carga nem os circuitos do cômodo removido', () => {
  const { banheiro } = montar();
  const antes = calcularMateriais(useStore.getState());
  const totAntes = calcTotais(useStore.getState());
  useStore.getState().removeRoom(banheiro.id);
  const depois = calcularMateriais(useStore.getState());
  const totDepois = calcTotais(useStore.getState());
  assert.ok(antes.circuitos.some((c) => c.comodo === 'Banheiro'));
  assert.ok(!depois.circuitos.some((c) => c.comodo === 'Banheiro'));
  // chuveiro (5500) + aquecedor (4500) + iluminação e TUG do banheiro saem da carga total
  const cargaBanheiro = antes.circuitos.filter((c) => c.comodo === 'Banheiro').reduce((a, c) => a + c.potenciaW, 0);
  assert.ok(cargaBanheiro >= 10000);
  assert.equal(depois.quadro.cargaTotalW, Math.round(antes.quadro.cargaTotalW - cargaBanheiro));
  assert.equal(depois.quadro.nCircuitos, antes.quadro.nCircuitos - 4);
  assert.ok(!totDepois.porComodo.some((p) => p.roomId === banheiro.id));
  assert.equal(totDepois.totalLuzes, totAntes.totalLuzes - 1);
});

console.log(`\n${ok} testes OK`);
