/*
 * Divisão de circuitos: modos (padrão/econômico/mais econômico/manual), grupos de cômodos, limites e sem duplicar cabo.
 * Rodar: node tests/circuitos.test.mjs
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
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { resolverUnidades, circuitosBrutos, compararCircuitos } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { exigirDados } = loadTs(resolve(ROOT, 'lib/server/rota.ts'));
const { calcPendencias } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { gerarHtmlPdf } = loadTs(resolve(ROOT, 'lib/server/pdf-template.ts'));
const { classeCircuito, podarConfig } = loadTs(resolve(ROOT, 'lib/circuitos-config.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
let n = 0; const id = () => 'k' + (++n);
const room = (nome, x = {}) => {
  const luz = { id: id(), d: '', cx: 'Redonda' };
  return {
    id: id(), base: nome, nome, c: '4', l: '3', medE: false, via: '', dq: '10', dd: '', dr: '',
    dqE: false, ddE: false, drE: false, dpad: '1.5', dpadE: true,
    pontos: [
      { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] },
      { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] },
    ],
    luzes: [luz],
    comandos: [{ id: id(), t: 'IS', luzes: [luz.id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] }],
    caixas: [], luzAuto: true, inst: 'Embutida na parede', pe: '2.8', obs: '', ...x,
  };
};
const estado = (rooms, circuitos, equips = []) => ({ imovel: 'Casa', obra: 'Reforma', cobertura: 'Laje', rede: 'Bifásico', rooms, equips, circuitos });
const cfg = (modo, extra = {}) => ({ modo, unico: [], grupos: [], ...extra });
const nomes = (st) => calcularMateriais(st).circuitos.map((c) => c.nome);

const sala = room('Sala', { dq: '8' });
const jantar = room('Sala de jantar', { via: sala.id, dd: '5', dr: '3' });
const q1 = room('Quarto 1', { dq: '12' });
const q2 = room('Quarto 2', { via: q1.id, dd: '6', dr: '2.5' });
const coz = room('Cozinha', { dq: '9' });
const ban = room('Banheiro', { dq: '7' });
const todos = [sala, jantar, q1, q2, coz, ban];

t('padrão (norma): 1 circuito de luz + 1 de tomadas por cômodo, igual a antes', () => {
  const c = calcularMateriais(estado(todos, cfg('norma'))).circuitos;
  assert.equal(c.length, 12);
  assert.ok(c.every((x) => x.tipo === 'iluminacao' || x.tipo === 'tug'));
  assert.equal(calcularMateriais(estado(todos, undefined)).circuitos.length, 12); // orçamento antigo, sem config
});

t('classe dos cômodos: comum, serviço (cozinha) e isolado (banheiro)', () => {
  assert.equal(classeCircuito(sala), 'comum');
  assert.equal(classeCircuito(coz), 'servico');
  assert.equal(classeCircuito(ban), 'isolado');
});

t('econômico: luz + tomadas juntas só nos cômodos comuns; cozinha e banheiro seguem separados', () => {
  const c = calcularMateriais(estado(todos, cfg('economico'))).circuitos;
  assert.equal(c.filter((x) => x.tipo === 'misto').length, 4); // sala, jantar, q1, q2
  assert.equal(c.length, 4 + 2 + 2); // + cozinha(2) + banheiro(2)
  assert.ok(c.find((x) => x.nome === 'Iluminação e tomadas — Sala'));
  assert.ok(c.find((x) => x.nome === 'Iluminação — Cozinha') && c.find((x) => x.nome === 'Tomadas (TUG) — Banheiro'));
});

t('mais econômico: junta cômodos que seguem o mesmo caminho (via) num circuito só', () => {
  const c = calcularMateriais(estado(todos, cfg('maximo'))).circuitos;
  assert.ok(c.find((x) => x.nome === 'Iluminação e tomadas — Sala + Sala de jantar'));
  assert.ok(c.find((x) => x.nome === 'Iluminação e tomadas — Quarto 1 + Quarto 2'));
  assert.equal(c.length, 2 + 2 + 2); // 2 grupos + cozinha + banheiro
});

t('SEM DUPLICAR CABO: o grupo mede trajeto do 1º cômodo + metros extras, não dois trajetos', () => {
  const c = calcularMateriais(estado(todos, cfg('maximo'))).circuitos;
  assert.equal(c.find((x) => x.nome.endsWith('Sala + Sala de jantar')).comprimentoM, 8 + 3);   // 11 m (e não 8 + 8)
  assert.equal(c.find((x) => x.nome.endsWith('Quarto 1 + Quarto 2')).comprimentoM, 12 + 2.5);   // 14,5 m
  const metros = (modo) => calcularMateriais(estado(todos, cfg(modo))).circuitos.reduce((s, x) => s + x.comprimentoM, 0);
  assert.ok(metros('economico') < metros('norma'));
  assert.ok(metros('maximo') < metros('economico'));
});

t('SEM DUPLICAR ELETRODUTO: mais circuitos juntos = menos metros de eletroduto na lista de materiais', () => {
  const metrosEletroduto = (modo) => calcularMateriais(estado(todos, cfg(modo))).materiais
    .filter((m) => /Eletroduto flexível corrugado/.test(m.item)).reduce((s, m) => s + m.qtd, 0);
  assert.ok(metrosEletroduto('economico') < metrosEletroduto('norma'));
  assert.ok(metrosEletroduto('maximo') < metrosEletroduto('economico'));
});

t('disjuntores, quadro e conectores diminuem junto com os circuitos', () => {
  const norma = calcularMateriais(estado(todos, cfg('norma')));
  const max = calcularMateriais(estado(todos, cfg('maximo')));
  const nDj = (r) => r.materiais.filter((m) => /^Disjuntor \d+A$/.test(m.item)).reduce((s, m) => s + m.qtd, 0);
  assert.equal(nDj(norma), 12);
  assert.equal(nDj(max), 6);
  assert.ok(max.quadro.nCircuitos < norma.quadro.nCircuitos);
  assert.ok(max.quadro.reserva <= norma.quadro.reserva);
  assert.equal(max.quadro.cargaTotalW, norma.quadro.cargaTotalW); // a carga (e a demanda da entrada) não muda
});

t('manual: grupo só de tomadas (sem luz+tomada juntas) gera 1 circuito de luz e 1 de tomadas para os 2 quartos', () => {
  const g = { id: 'g1', rooms: [q1.id, q2.id], dists: ['', '4'] };
  const c = calcularMateriais(estado(todos, cfg('manual', { grupos: [g] }))).circuitos;
  assert.ok(c.find((x) => x.nome === 'Iluminação — Quarto 1 + Quarto 2'));
  assert.ok(c.find((x) => x.nome === 'Tomadas (TUG) — Quarto 1 + Quarto 2'));
  assert.equal(c.find((x) => x.nome === 'Tomadas (TUG) — Quarto 1 + Quarto 2').comprimentoM, 12 + 4);
});

t('manual: luz + tomadas juntas só em um cômodo escolhido', () => {
  const c = calcularMateriais(estado(todos, cfg('manual', { unico: [sala.id] }))).circuitos;
  assert.ok(c.find((x) => x.nome === 'Iluminação e tomadas — Sala'));
  assert.ok(c.find((x) => x.nome === 'Iluminação — Quarto 1'));
  assert.equal(c.length, 11);
});

t('banheiro nunca divide circuito, nem no manual (DR)', () => {
  const g = { id: 'g', rooms: [q1.id, ban.id], dists: ['', '2'] };
  const r = resolverUnidades(todos, cfg('manual', { grupos: [g], unico: [ban.id] }));
  assert.ok(r.unidades.every((u) => u.rooms.length === 1));
  assert.ok(!r.unidades.find((u) => u.rooms[0].id === ban.id).unico);
  assert.ok(r.avisos.some((a) => a.includes('Banheiro')));
});

t('cozinha não junta com sala; cozinha com área de serviço pode, mas sem luz+tomada no mesmo disjuntor', () => {
  const r1 = resolverUnidades(todos, cfg('manual', { grupos: [{ id: 'g', rooms: [sala.id, coz.id], dists: ['', '2'] }] }));
  assert.ok(r1.unidades.every((u) => u.rooms.length === 1));
  const serv = room('Área de serviço', { dq: '9' });
  const r2 = resolverUnidades([coz, serv], cfg('manual', { grupos: [{ id: 'g', rooms: [coz.id, serv.id], dists: ['', '2'], unico: true }] }));
  assert.equal(r2.unidades.length, 1);
  assert.equal(r2.unidades[0].unico, false);
  const c = circuitosBrutos(r2.unidades);
  assert.deepEqual(c.map((x) => x.tipo).sort(), ['iluminacao', 'tug']);
});

t('cômodos com instalação diferente (embutida x aparente) não dividem circuito', () => {
  const ap = room('Quarto 3', { inst: 'Aparente' });
  const r = resolverUnidades([q1, ap], cfg('manual', { grupos: [{ id: 'g', rooms: [q1.id, ap.id], dists: ['', '3'] }] }));
  assert.ok(r.unidades.every((u) => u.rooms.length === 1));
});

t('limite de 2.500 VA: circuito que passaria disso volta a ser separado, com aviso', () => {
  const grande = (nome, x = {}) => room(nome, { c: '6', l: '6', pontos: Array.from({ length: 13 }, () => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] })), ...x });
  const a = grande('Sala grande'), b = grande('Sala 2', { via: a.id, dd: '4', dr: '2' });
  const r = resolverUnidades([a, b], cfg('maximo'));
  assert.equal(r.unidades.length, 2); // 13 tomadas x 100 VA x 2 = 2.600 VA > 2.500 → separa os cômodos
  assert.ok(r.avisos.length > 0);
  const u = resolverUnidades([a], cfg('economico')).unidades[0];
  assert.equal(u.unico, true); // 1.300 + ilum 100 = 1.400 VA: cabe
});

t('distância entre cômodos do grupo vazia gera aviso (e pendência na prévia)', () => {
  const g = { id: 'g', rooms: [q1.id, q2.id], dists: ['', ''] };
  const st = estado(todos, cfg('manual', { grupos: [g] }));
  assert.ok(resolverUnidades(todos, st.circuitos).avisos.some((a) => a.includes('Informe a distância')));
  assert.ok(calcPendencias(st).some((p) => p.msg.startsWith('Circuitos:') && p.step === 3));
});

t('"mais econômico" usa o desvio (dr) do cômodo como cabo extra; sem dr, avisa', () => {
  const sem = room('Sala de TV', { via: sala.id, dd: '5', dr: '' });
  const r = resolverUnidades([sala, sem], cfg('maximo'));
  assert.equal(r.unidades.length, 1);
  assert.ok(r.avisos.some((a) => a.includes('Informe a distância')));
});

t('compararCircuitos: números por modo e configuração resolvida para ajuste manual', () => {
  const eq = [{ id: 'e1', tipo: 'Chuveiro elétrico', room: ban.id, pot: '5500', tens: '220V', dint: '1', dist: '', alim: '' }];
  const cmp = compararCircuitos(todos, eq, cfg('norma'));
  assert.equal(cmp.nTUE, 1);
  assert.equal(cmp.modos.norma.disjuntores, 12 + 1);
  assert.equal(cmp.modos.economico.disjuntores, 8 + 1);
  assert.equal(cmp.modos.maximo.disjuntores, 6 + 1);
  assert.ok(cmp.modos.maximo.metrosCabo < cmp.modos.economico.metrosCabo);
  const cm = compararCircuitos(todos, eq, cfg('maximo')).resolvido;
  assert.equal(cm.modo, 'manual');
  assert.equal(cm.grupos.length, 2);
  assert.deepEqual(cm.grupos[0].dists, ['', '3']);
});

t('TUE no cômodo de um grupo conta no agrupamento do grupo (fator de agrupamento)', () => {
  const eq = [{ id: 'e1', tipo: 'Ar-condicionado', room: jantar.id, pot: '1400', tens: '220V', dint: '1', dist: '', alim: '' }];
  const r = calcularMateriais(estado(todos, cfg('maximo'), eq));
  const tue = r.circuitos.find((c) => c.tipo === 'tue');
  assert.ok(tue && tue.comodo === 'Sala de jantar');
  assert.ok(r.circuitos.length >= 7);
});

t('validação do servidor aceita a config e recusa lixo', () => {
  const g = { id: 'g1', rooms: [q1.id, q2.id], dists: ['', '4'], unico: true };
  const d = exigirDados(estado(todos, cfg('manual', { grupos: [g] })), false);
  assert.equal(d.circuitos.grupos.length, 1);
  for (const ruim of [{ modo: 'xyz', unico: [], grupos: [] }, { modo: 'manual', unico: [1], grupos: [] }, { modo: 'manual', unico: [], grupos: [{ id: 'g', rooms: ['a'], dists: ['-5'] }] }, 'texto']) {
    assert.throws(() => exigirDados(estado(todos, ruim), false));
  }
});

t('config com id de cômodo inexistente é ignorada sem quebrar o cálculo', () => {
  const g = { id: 'g', rooms: ['nao-existe', q1.id, 'outro'], dists: ['', '3', '4'] };
  const c = calcularMateriais(estado(todos, cfg('manual', { grupos: [g], unico: ['fantasma'] }))).circuitos;
  assert.equal(c.length, 12);
});

t('store: remover cômodo tira ele dos grupos e desfaz grupo com menos de 2', () => {
  const S = () => useStore.getState();
  S().resetState();
  [q1, q2, sala].forEach((r) => S().addRoom(r));
  S().setCircuitos(cfg('manual', { grupos: [{ id: 'g', rooms: [q1.id, q2.id], dists: ['', '3'] }], unico: [sala.id] }));
  assert.equal(S().circuitos.grupos.length, 1);
  S().removeRoom(q2.id);
  assert.equal(S().circuitos.grupos.length, 0);
  assert.deepEqual(S().circuitos.unico, [sala.id]);
  assert.equal(JSON.parse(mem.get('orca_v2')).dados.circuitos.grupos.length, 0);
});

t('podarConfig mantém dists alinhadas ao tirar cômodo do meio', () => {
  const p = podarConfig({ modo: 'manual', unico: [], grupos: [{ id: 'g', rooms: ['a', 'x', 'b'], dists: ['', '1', '2'] }] }, [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(p.grupos[0].rooms, ['a', 'b']);
  assert.deepEqual(p.grupos[0].dists, ['', '2']);
});

t('PDF: mostra o circuito juntado uma vez, explica a divisão e não lista os circuitos separados dos mesmos cômodos', () => {
  const html = gerarHtmlPdf(estado(todos, cfg('maximo')));
  assert.equal(html.split('Iluminação e tomadas — Sala + Sala de jantar').length - 1, 1);
  assert.ok(!html.includes('Iluminação — Sala + Sala de jantar') && !html.includes('Tomadas (TUG) — Sala + Sala de jantar'));
  assert.ok(!html.includes('Iluminação — Sala<') && !html.includes('Iluminação — Sala de jantar'));
  assert.ok(html.includes('Divisão de circuitos: mais econômico'));
  assert.ok(html.includes('Iluminação + Tomadas'));
  assert.ok(html.includes('Iluminação — Cozinha') && html.includes('Tomadas (TUG) — Banheiro'));
});

t('PDF: no padrão não aparece a observação de divisão e os circuitos saem separados como antes', () => {
  const html = gerarHtmlPdf(estado(todos, cfg('norma')));
  assert.ok(!html.includes('Divisão de circuitos'));
  assert.ok(html.includes('Iluminação — Sala<') && html.includes('Tomadas (TUG) — Sala<'));
  assert.ok(!html.includes('Iluminação + Tomadas'));
});

t('PDF: avisos de limite aparecem nas observações', () => {
  const grande = (nome, x = {}) => room(nome, { c: '6', l: '6', pontos: Array.from({ length: 13 }, () => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] })), ...x });
  const a = grande('Sala grande'), b = grande('Sala 2', { via: a.id, dd: '4', dr: '2' });
  const html = gerarHtmlPdf(estado([a, b], cfg('maximo')));
  assert.ok(html.includes('passam de 2500 VA') || html.includes('passam de 2.500 VA'));
});

console.log(`\n${ok} testes OK`);
