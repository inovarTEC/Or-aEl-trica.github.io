/*
 * Limpeza de itens órfãos: remoção de módulo, luz, interruptor e rede de segurança (lib/limpeza.ts).
 * Rodar: node tests/orfaos.test.mjs
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
const { ROOM_TEMPLATES } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { calcTotais } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { tomadasNbr } = loadTs(resolve(ROOT, 'lib/validacao.ts'));
const { limparOrfaos } = loadTs(resolve(ROOT, 'lib/limpeza.ts'));
const { exigirDados } = loadTs(resolve(ROOT, 'lib/server/rota.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const S = () => useStore.getState();
const tpl = (label) => ROOM_TEMPLATES.find((x) => x.label === label).create();
const roomDe = (id) => S().rooms.find((r) => r.id === id);
const nPontos = (r) => r.pontos.length;

let n = 0; const id = () => 'o' + (++n);
function montar() {
  S().resetState();
  const luz1 = { id: id(), d: '', cx: 'Redonda' };
  const luz2 = { id: id(), d: '', cx: 'Redonda' };
  const r = {
    id: id(), base: 'Sala', nome: 'Sala', c: '4', l: '3', medE: false, via: '', dq: '8', dd: '', dr: '',
    dqE: false, ddE: false, drE: false, dpad: '1.5', dpadE: true,
    pontos: [
      { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: 'm1', t: 'T10D' }] },
      { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: 'm2', t: 'T10D' }, { id: 'm3', t: 'T10' }] },
      { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: 'm4', t: 'T10D' }] },
    ],
    luzes: [luz1, luz2],
    comandos: [
      { id: 'c1', t: 'IS', luzes: [luz1.id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] },
      { id: 'c2', t: 'IS', luzes: [luz2.id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] },
    ],
    caixas: [], luzAuto: true, inst: 'Embutida na parede', pe: '2.8', obs: '',
  };
  S().addRoom(r);
  return S().rooms[0];
}
const totais = () => calcTotais(S());
const pontoDe = (r, pid) => r.pontos.find((p) => p.id === pid);

t('removeModulo do último módulo remove o ponto vazio e a caixa dele', () => {
  const r = montar();
  const p = r.pontos[0];
  const antes = totais();
  S().removeModulo(r.id, p.id, 'm1');
  const dep = roomDe(r.id);
  assert.ok(!pontoDe(dep, p.id), 'ponto vazio não pode sobrar');
  const tot = totais();
  assert.equal(tot.totalCaixas, antes.totalCaixas - 1);
  assert.equal(tot.totalTomadas, antes.totalTomadas - 1);
});

t('removeModulo de um módulo de ponto com 2 módulos mantém o ponto', () => {
  const r = montar();
  const p = r.pontos[1];
  S().removeModulo(r.id, p.id, 'm3');
  const dep = pontoDe(roomDe(r.id), p.id);
  assert.ok(dep);
  assert.equal(dep.mods.length, 1);
});

t('removeLuz remove também o interruptor que ficou sem luz (caixa e placa saem do cálculo)', () => {
  const r = montar();
  const antes = totais();
  S().removeLuz(r.id, r.luzes[0].id);
  const dep = roomDe(r.id);
  assert.equal(dep.luzes.length, 1);
  assert.equal(dep.comandos.length, 1);
  assert.ok(!dep.comandos.some((c) => c.id === 'c1'));
  const tot = totais();
  assert.equal(tot.totalLuzes, antes.totalLuzes - 1);
  assert.equal(tot.totalInterruptores, antes.totalInterruptores - 1);
  assert.equal(tot.totalCaixas, antes.totalCaixas - 2); // caixa da luz (octogonal/redonda) + caixa do interruptor
});

t('removeLuz de uma luz de interruptor com 2 luzes mantém o interruptor', () => {
  const r = montar();
  S().vincularLuzComando(r.id, r.luzes[1].id, 'c1'); // c1 com 2 luzes, c2 vazio
  S().removeLuz(r.id, r.luzes[0].id);
  const dep = roomDe(r.id);
  assert.ok(dep.comandos.some((c) => c.id === 'c1' && c.luzes.length === 1));
});

t('removeLuz mantém o interruptor que tem tomada na placa', () => {
  const r = montar();
  S().updateSw(r.id, 'c1', r.comandos[0].sws[0].id, { tom: 'T10' });
  S().removeLuz(r.id, r.luzes[0].id);
  const c1 = roomDe(r.id).comandos.find((c) => c.id === 'c1');
  assert.ok(c1, 'interruptor com tomada fica');
  assert.equal(c1.luzes.length, 0);
});

t('removeComando e removePonto tiram o material do cálculo', () => {
  const r = montar();
  const antes = totais();
  S().removeComando(r.id, 'c2');
  S().removePonto(r.id, r.pontos[2].id);
  const tot = totais();
  assert.equal(tot.totalInterruptores, antes.totalInterruptores - 1);
  assert.equal(tot.totalTomadas, antes.totalTomadas - 1);
  assert.ok(tot.totalCaixas < antes.totalCaixas);
});

t('limparOrfaos descarta ponto vazio, interruptor sem função e luz inexistente', () => {
  const r = montar();
  const sujo = JSON.parse(JSON.stringify(S().rooms));
  sujo[0].pontos.push({ id: 'fantasma', h: 'baixa', d: '', cx: '4x2', mods: [] });
  sujo[0].comandos[0].luzes = ['luz-que-nao-existe'];
  const { rooms } = limparOrfaos({ rooms: sujo });
  assert.ok(!rooms[0].pontos.some((p) => p.id === 'fantasma'));
  assert.ok(!rooms[0].comandos.some((c) => c.id === 'c1'));
  assert.ok(rooms[0].comandos.some((c) => c.id === 'c2'));
});

t('limparOrfaos limpa rota "via" e equipamento de cômodo que não existe, mas mantém equip sem cômodo', () => {
  const r = montar();
  const outro = { ...JSON.parse(JSON.stringify(r)), id: 'r2', via: 'removido' };
  const equips = [
    { id: 'e1', tipo: 'Chuveiro elétrico', room: 'removido', pot: '5500', tens: '220V', dint: '1', dist: '', alim: '' },
    { id: 'e2', tipo: 'Chuveiro elétrico', room: '', pot: '5500', tens: '220V', dint: '1', dist: '', alim: '' },
    { id: 'e3', tipo: 'Chuveiro elétrico', room: r.id, pot: '5500', tens: '220V', dint: '1', dist: '', alim: '' },
  ];
  const out = limparOrfaos({ rooms: [S().rooms[0], outro], equips });
  assert.equal(out.rooms[1].via, '');
  assert.deepEqual(out.equips.map((e) => e.id), ['e2', 'e3']);
});

t('limparOrfaos não altera o objeto original', () => {
  const r = montar();
  const sujo = JSON.parse(JSON.stringify(S().rooms));
  sujo[0].pontos.push({ id: 'fantasma', h: 'baixa', d: '', cx: '4x2', mods: [] });
  limparOrfaos({ rooms: sujo });
  assert.ok(sujo[0].pontos.some((p) => p.id === 'fantasma'));
});

t('o servidor (exigirDados) já recebe os dados limpos: prévia/PDF não contam o fantasma', () => {
  const r = montar();
  const sujo = JSON.parse(JSON.stringify(S().rooms));
  sujo[0].pontos.push({ id: 'fantasma', h: 'baixa', d: '', cx: '4x2', mods: [] });
  const limpo = exigirDados({ imovel: 'Casa', obra: 'Reforma', rooms: sujo, equips: [] }, false);
  const comFantasma = calcTotais({ rooms: sujo, equips: [] });
  const semFantasma = calcTotais(limpo);
  assert.equal(semFantasma.totalCaixas, comFantasma.totalCaixas - 1);
});

t('hydrateFromStorage limpa orçamento antigo salvo no navegador com itens órfãos', () => {
  const r = montar();
  const salvo = JSON.parse(mem.get('orca_v2'));
  salvo.dados.rooms[0].pontos.push({ id: 'fantasma', h: 'baixa', d: '', cx: '4x2', mods: [] });
  mem.set('orca_v2', JSON.stringify(salvo));
  S().hydrateFromStorage();
  assert.ok(!S().rooms[0].pontos.some((p) => p.id === 'fantasma'));
});

console.log(`\n${ok} testes OK`);
