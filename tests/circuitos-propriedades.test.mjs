/*
 * Propriedades da divisão de circuitos em 400 cenários aleatórios (reprodutíveis) + regressões.
 * Rodar: node tests/circuitos-propriedades.test.mjs
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


const { calcularMateriais } = loadTs(ROOT + '/lib/server/calc-materiais.ts');
const { resolverUnidades } = loadTs(ROOT + '/lib/server/circuitos.ts');
// Gerador pseudo-aleatório fixo: o teste é reproduzível.
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
let n = 0; const id = () => 'p' + (++n);
const NOMES = ['Sala', 'Sala de jantar', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Escritório', 'Cozinha', 'Área de serviço', 'Banheiro', 'Lavabo', 'Varanda', 'Corredor'];
function room(nome, via) {
  const luzes = rnd() < 0.9 ? [{ id: id(), d: '', cx: 'Redonda' }] : [];
  const np = Math.floor(rnd() * 6);
  return {
    id: id(), base: nome, nome, c: String(2 + Math.floor(rnd() * 5)), l: String(2 + Math.floor(rnd() * 5)), via: via ?? '', dq: String(3 + Math.floor(rnd() * 12)),
    dd: via ? '3' : '', dr: via && rnd() < 0.7 ? '2' : '', dpad: '1.5', inst: rnd() < 0.8 ? 'Embutida na parede' : 'Aparente', pe: '2.8',
    pontos: Array.from({ length: np }, () => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: pick(['T10', 'T10D', 'T20']) }] })),
    luzes, comandos: luzes.length ? [{ id: id(), t: 'IS', luzes: [luzes[0].id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] }] : [], caixas: [], obs: '',
  };
}
let casos = 0;
for (let it = 0; it < 400; it++) {
  const rooms = [];
  const k = 2 + Math.floor(rnd() * 8);
  for (let i = 0; i < k; i++) rooms.push(room(pick(NOMES) + (i ? ' ' + (i + 1) : ''), rooms.length && rnd() < 0.5 ? pick(rooms).id : undefined));
  const ids = rooms.map((r) => r.id);
  const eq = rnd() < 0.5 ? [{ id: id(), tipo: 'Chuveiro elétrico', room: pick(ids), pot: '5500', tens: '220V', dint: '1', dist: '', alim: '' }] : [];
  const modo = pick(['norma', 'economico', 'maximo', 'manual']);
  const grupos = modo === 'manual' && rnd() < 0.8 ? [{ id: id(), rooms: [pick(ids), pick(ids), pick(ids)], dists: ['', String(rnd() < 0.5 ? 2 : ''), '3'], unico: rnd() < 0.5 }] : [];
  const circuitos = { modo, unico: modo === 'manual' ? ids.filter(() => rnd() < 0.3) : [], grupos };
  const st = { imovel: 'Casa', obra: 'Reforma', cobertura: 'Laje', rede: 'Bifásico', rooms, equips: eq, circuitos };
  const r = calcularMateriais(st);
  const { unidades } = resolverUnidades(rooms, circuitos);
  // 1) cada cômodo em exatamente 1 unidade
  const vistos = rooms.flatMap((_, i) => unidades.filter((u) => u.rooms.includes(rooms[i])).map(() => rooms[i].id));
  assert.equal(vistos.length, rooms.length, 'cômodo em 0 ou 2 unidades');
  assert.equal(new Set(vistos).size, rooms.length);
  // 2) iluminação e tomadas de cada cômodo aparecem em exatamente 1 circuito (nunca 2 disjuntores p/ o mesmo)
  for (const u of unidades) {
    const nome = u.rooms.map((x) => x.nome).join(' + ');
    const meus = r.circuitos.filter((c) => c.comodo === nome && c.tipo !== 'tue');
    const temI = u.rooms.some((x) => x.luzes.length > 0);
    const temT = u.rooms.some((x) => x.pontos.length > 0);
    const esperado = u.unico && temI && temT ? 1 : (temI ? 1 : 0) + (temT ? 1 : 0);
    assert.equal(meus.length, esperado, `${nome}: ${meus.length} circuitos, esperado ${esperado}`);
  }
  // 3) nomes únicos entre circuitos de luz/tomada
  const nomes = r.circuitos.filter((c) => c.tipo !== 'tue').map((c) => c.nome);
  assert.equal(new Set(nomes).size, nomes.length, 'circuito duplicado: ' + nomes.join('|'));
  // 4) disjuntores na lista = circuitos; quadro conta igual
  const nDj = r.materiais.filter((m) => /^Disjuntor \d+A$/.test(m.item)).reduce((s, m) => s + m.qtd, 0);
  assert.equal(nDj, r.circuitos.length);
  assert.equal(r.quadro.nCircuitos, r.circuitos.length);
  // 5) potência total NUNCA muda com o agrupamento (só a divisão)
  const norma = calcularMateriais({ ...st, circuitos: { modo: 'norma', unico: [], grupos: [] } });
  assert.equal(r.quadro.cargaTotalW, norma.quadro.cargaTotalW, 'carga mudou com o agrupamento');
  // 6) agrupar nunca aumenta circuitos nem cabo
  assert.ok(r.circuitos.length <= norma.circuitos.length);
  const m = (x) => x.circuitos.reduce((s, c) => s + c.comprimentoM, 0);
  assert.ok(m(r) <= m(norma) + 1e-9, 'cabo aumentou');
  // 7) cômodo isolado/serviço nunca em circuito misto
  for (const c of r.circuitos.filter((c) => c.tipo === 'misto')) assert.ok(!/Banheiro|Lavabo|Varanda|Cozinha|serviço/i.test(c.comodo), c.comodo);
  casos++;
}
assert.equal(casos, 400);
console.log(`✓ ${casos} cenários aleatórios: sem circuito duplicado, sem disjuntor a mais, carga idêntica, cabo nunca aumenta`);

// Regressões encontradas pelo teste acima
const mk = (nome, x = {}) => {
  const luz = { id: id(), d: '', cx: 'Redonda' };
  return { id: id(), base: nome, nome, c: '4', l: '3', via: '', dq: '10', dd: '', dr: '', dpad: '1.5', inst: 'Embutida na parede', pe: '2.8',
    pontos: [{ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] }], luzes: [luz],
    comandos: [{ id: id(), t: 'IS', luzes: [luz.id], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] }], caixas: [], obs: '', ...x };
};
{
  const a = mk('Quarto A'), b = mk('Quarto B');
  const r = resolverUnidades([a, b], { modo: 'manual', unico: [], grupos: [{ id: 'g', rooms: [a.id, a.id, b.id], dists: ['', '2', '3'] }] });
  assert.equal(r.unidades.length, 1);
  assert.equal(r.unidades[0].rooms.length, 2, 'cômodo repetido no grupo não pode entrar duas vezes');
  console.log('✓ cômodo repetido na lista do grupo é ignorado (não duplica potência nem cabo)');
}
{
  const a = mk('Quarto A', { dq: '10' });
  const vazio = mk('Quarto vazio', { pontos: [], luzes: [], comandos: [] });
  const st = { imovel: 'Casa', obra: 'Reforma', cobertura: 'Laje', rede: 'Bifásico', rooms: [a, vazio], equips: [],
    circuitos: { modo: 'manual', unico: [], grupos: [{ id: 'g', rooms: [a.id, vazio.id], dists: ['', '7'] }] } };
  const c = calcularMateriais(st).circuitos;
  assert.ok(c.every((x) => x.comprimentoM === 10), 'cômodo sem luz/tomada no fim do grupo não gasta cabo');
  console.log('✓ cômodo vazio no fim do grupo não soma cabo');
}
