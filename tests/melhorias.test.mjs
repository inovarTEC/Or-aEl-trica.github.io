/*
 * Testes das melhorias: potência automática da entrada, cômodo novo, equipamento recolhido e remoção sincronizada.
 * Rodar: node tests/melhorias.test.mjs
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


const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { entradaPadrao, sincronizarEntrada, textoPotencia, materiaisEntrada } = loadTs(resolve(ROOT, 'lib/entrada-calc.ts'));
const { ROOM_TEMPLATES, novoComodo, nomeUnico } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { faltasEquip, resumoLinhaEquip } = loadTs(resolve(ROOT, 'lib/ponto-equip.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
let n = 0; const id = () => 'm' + (++n);
const equip = (roomId, tipo = 'Chuveiro elétrico', pot = '5500') =>
  ({ id: id(), tipo, room: roomId, pot, tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });

// ---- Entrada: potência automática ----
t('potência automática acompanha a demanda e ajusta a bitola/sistema', () => {
  const e = { ...entradaPadrao(), percurso: '15', sistemaTensao: '380/220' };
  const p = sincronizarEntrada(e, 3.67);
  assert.equal(p.potenciaDemandada, '3.67');
  const e2 = { ...e, ...p };
  assert.deepEqual(sincronizarEntrada(e2, 3.67), {}); // estável: não gera laço
  const p2 = sincronizarEntrada(e2, 20);
  assert.equal(p2.potenciaDemandada, '20');
  assert.equal(p2.sistema, 'trifasico');
});
t('valor editado pela pessoa não é sobrescrito; apagar volta ao automático', () => {
  const e = { ...entradaPadrao(), potenciaDemandada: '9', potenciaManual: true };
  assert.equal(sincronizarEntrada(e, 3.67).potenciaDemandada, undefined);
  const volta = sincronizarEntrada({ ...e, potenciaManual: false }, 3.67);
  assert.equal(volta.potenciaDemandada, '3.67');
});
t('sem cômodos nem equipamentos a potência automática esvazia', () => {
  const e = { ...entradaPadrao(), potenciaDemandada: '3.67', sistemaTensao: '220/127' };
  assert.equal(sincronizarEntrada(e, null).potenciaDemandada, '');
  assert.equal(textoPotencia(0), '');
  assert.equal(textoPotencia(3.6666), '3.67');
});
t('potência manual mantém bitola/sistema manuais intactos', () => {
  const e = { ...entradaPadrao(), potenciaDemandada: '30', potenciaManual: true, sistemaManual: true, bitolaManual: true, bitola: '10' };
  const p = sincronizarEntrada(e, 3);
  assert.equal(p.sistema, undefined);
  assert.equal(p.bitola, undefined);
});

// ---- Remover cômodo/equipamento: tudo sincronizado ----
const monta = () => {
  useStore.getState().resetState();
  const s = useStore.getState();
  const [q, su] = ['Quarto', 'Suíte 1'].map((nome) => novoComodo(ROOM_TEMPLATES[0], s.rooms, { nome, c: '3', l: '3', }));
  s.addRoom(q); s.addRoom(su);
  s.addEquip(equip(su.id));
  return { q, su };
};
t('addRoom guarda na ordem (novo no fim; a inversão é só na tela)', () => {
  const { q, su } = monta();
  assert.deepEqual(useStore.getState().rooms.map((r) => r.id), [q.id, su.id]);
});
t('apagar cômodo: some equipamento, circuito e material, e a demanda cai', () => {
  const { su } = monta();
  const antes = calcularMateriais(useStore.getState());
  assert.ok(antes.circuitos.some((c) => c.comodo === 'Suíte 1'));
  useStore.getState().removeRoom(su.id);
  const s = useStore.getState();
  assert.equal(s.equips.length, 0);
  const depois = calcularMateriais(s);
  assert.ok(!depois.circuitos.some((c) => /Suíte 1/.test(c.nome + (c.comodo ?? ''))));
  assert.ok(depois.quadro.demandaKva < antes.quadro.demandaKva);
  // entrada sincronizada com a nova demanda = bitola/potência do PDF coerentes
  const ent = { ...entradaPadrao(), ...s.entrada };
  const p = sincronizarEntrada(ent, depois.quadro.demandaKva);
  assert.equal({ ...ent, ...p }.potenciaDemandada, textoPotencia(depois.quadro.demandaKva));
  const nomes = materiaisEntrada({ ...ent, ...p }).map((m) => m.descricao);
  assert.equal(new Set(nomes).size, nomes.length); // sem linhas duplicadas
});
t('materiais finais sem itens duplicados', () => {
  monta();
  const r = calcularMateriais(useStore.getState());
  const chaves = r.materiais.map((m) => `${m.item}|${m.detalhe}`);
  assert.equal(new Set(chaves).size, chaves.length);
});

// ---- Migração de orçamento antigo ----
t('orçamento antigo com potência digitada vira manual ao carregar', () => {
  const antigo = { ...useStore.getState(), entrada: (() => { const e = entradaPadrao(); delete e.potenciaManual; e.potenciaDemandada = '8'; return e; })() };
  mem.set('orca_v2', JSON.stringify({ versao: 2, criadoEm: Date.now(), expiraEm: Date.now() + 1e9, dados: antigo }));
  useStore.getState().hydrateFromStorage();
  assert.equal(useStore.getState().entrada.potenciaManual, true);
  assert.equal(useStore.getState().entrada.potenciaDemandada, '8');
});

// ---- Cômodo novo (aba + Cômodo) ----
t('novoComodo: nome único, medidas e tomadas automáticas', () => {
  const a = novoComodo(ROOM_TEMPLATES[0], []);
  const b = novoComodo(ROOM_TEMPLATES[0], [a]);
  assert.equal(b.nome, 'Quarto 2');
  assert.equal(nomeUnico('quarto', [{ nome: 'Quarto' }]), 'quarto 2');
  const c = novoComodo(ROOM_TEMPLATES[0], [a], { nome: 'Quarto casal', c: '5', l: '4' });
  assert.equal(c.nome, 'Quarto casal'); assert.equal(c.c, '5');
  useStore.getState().resetState();
  useStore.getState().addRoom(c);
  assert.ok(useStore.getState().rooms[0].pontos.length >= 3);
});

// ---- Equipamentos recolhidos ----
t('faltasEquip e linha-resumo', () => {
  assert.deepEqual(faltasEquip({ tipo: '', pot: '', room: '' }), ['tipo', 'potência', 'cômodo']);
  assert.deepEqual(faltasEquip({ tipo: 'Chuveiro elétrico', pot: '5500', room: 'x' }), []);
  const l = resumoLinhaEquip({ tipo: 'Chuveiro elétrico', pot: '5500', room: 'x', tens: '220V' }, [{ id: 'x', nome: 'Banheiro', base: 'Banheiro' }]);
  assert.match(l, /Chuveiro elétrico · Banheiro · 5\.500 W · 220V/);
  assert.match(resumoLinhaEquip({ tipo: '', pot: '', room: '' }, []), /Sem cômodo/);
});

console.log(`${ok} testes OK`);
