/*
 * REDE DE SEGURANÇA: congela circuitos, quadro, materiais, comparação dos modos e PDF de 5 casas de exemplo.
 * Se algo mudar sem querer em etapas futuras, este teste acusa. Para aceitar uma mudança de propósito: UPDATE_SNAPSHOT=1 node tests/rede-seguranca.test.mjs
 * Rodar: node tests/rede-seguranca.test.mjs
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

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { gerarHtmlPdf } = loadTs(resolve(ROOT, 'lib/server/pdf-template.ts'));
const { compararCircuitos } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));

const SNAP = resolve(ROOT, 'tests/snapshots/rede-seguranca.json');
const T = Object.fromEntries(ROOM_TEMPLATES.map((t, i) => [t.label, i]));

/* ---------- 5 casas de exemplo (determinísticas: só nomes e medidas, ids não entram no resultado) ---------- */
const CASAS = {
  'A apartamento pequeno': {
    tensao: '220/127',
    comodos: [['Sala típica', 'Sala', '4', '3'], ['Quarto típico', 'Quarto', '3', '3'], ['Banheiro típico', 'Banheiro', '2', '2'], ['Cozinha típica', 'Cozinha', '3', '2.5']],
    equips: [['Chuveiro elétrico', '5500', 'Banheiro']],
  },
  'B casa 6 comodos': {
    tensao: '220/127',
    comodos: [['Sala típica', 'Sala', '5', '4'], ['Cozinha típica', 'Cozinha', '4', '3'], ['Quarto típico', 'Quarto', '3.5', '3'], ['Suíte 1 (básica)', 'Suíte', '4', '3.5'], ['Banheiro típico', 'Banheiro', '2.5', '2'], ['Área de serviço', 'Área de serviço', '3', '2']],
    equips: [['Chuveiro elétrico', '5500', 'Banheiro'], ['Ar-condicionado', '1066', 'Suíte', 12000], ['Forno elétrico', '1500', 'Cozinha']],
  },
  'C casa grande com varanda': {
    tensao: '220/127',
    comodos: [['Sala típica', 'Sala', '6', '5'], ['Cozinha típica', 'Cozinha', '4', '4'], ['Quarto típico', 'Quarto 1', '3.5', '3'], ['Quarto típico', 'Quarto 2', '3.5', '3'], ['Suíte 2 (padrão)', 'Suíte', '4', '4'], ['Banheiro típico', 'Banheiro social', '2.5', '2'], ['Banheiro típico', 'Banheiro suíte', '2.5', '2'], ['Área de serviço', 'Área de serviço', '3', '2.5'], ['Personalizado', 'Varanda', '5', '2']],
    equips: [['Chuveiro elétrico', '5500', 'Banheiro social'], ['Chuveiro elétrico', '5500', 'Banheiro suíte'], ['Torneira elétrica', '3200', 'Cozinha'], ['Ar-condicionado', '1400', 'Quarto 1', 9000]],
    via: { 'Quarto 2': ['Quarto 1', '2.5'], 'Banheiro suíte': ['Suíte', '1.5'], 'Varanda': ['Sala', '2'] },
  },
  'D comodo unico': {
    tensao: '220/127',
    comodos: [['Personalizado', 'Edícula', '4', '3']],
    equips: [],
  },
  'E casa trifasica 380': {
    tensao: '380/220',
    comodos: [['Sala típica', 'Sala', '6', '5'], ['Cozinha típica', 'Cozinha', '4', '4'], ['Quarto típico', 'Quarto 1', '4', '4'], ['Quarto típico', 'Quarto 2', '4', '4'], ['Suíte 3 (luxo)', 'Suíte', '5', '4'], ['Banheiro típico', 'Banheiro', '3', '2.5'], ['Área de serviço', 'Área de serviço', '3', '3']],
    equips: [['Chuveiro elétrico', '7500', 'Banheiro'], ['Torneira elétrica', '3500', 'Cozinha'], ['Ar-condicionado', '2000', 'Suíte', 18000], ['Ar-condicionado', '1400', 'Quarto 1', 9000], ['Forno elétrico', '2500', 'Cozinha']],
  },
};

/* modo 'manual' de cada casa: junta os dois primeiros quartos (se houver) e deixa a luz+tomadas do 1º cômodo juntas */
function montar(nome, modo) {
  const c = CASAS[nome];
  const S = useStore.getState();
  S.resetState();
  const ids = {};
  for (const [tpl, rn, cc, ll] of c.comodos) {
    const r = novoComodo(ROOM_TEMPLATES[T[tpl]], useStore.getState().rooms, { nome: rn, c: cc, l: ll });
    r.dq = String(4 + 2 * Object.keys(ids).length); // distância até o quadro: sem isso o cabo medido seria ~0 e o teste não pegaria erro de cabo
    const v = (c.via ?? {})[rn];
    if (v) { r.via = ids[v[0]]; r.dd = '3'; r.dr = v[1]; }
    ids[rn] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: c.tensao });
  c.equips.forEach(([tipo, pot, rn, btu], i) => useStore.getState().addEquip({
    id: `eq${i}`, tipo, room: ids[rn], pot, tens: tipo === 'Torneira elétrica' || tipo === 'Chuveiro elétrico' || tipo === 'Forno elétrico' || tipo === 'Ar-condicionado' ? '220V' : '', dint: '1', dist: '', alim: '', cx: '4x2', ...(btu ? { btu } : {}),
  }));
  const quartos = c.comodos.filter(([, rn]) => /^Quarto/.test(rn)).map(([, rn]) => ids[rn]);
  const cfg = modo === 'manual'
    ? { modo: 'manual', unico: [Object.values(ids)[0]], grupos: quartos.length >= 2 ? [{ id: 'g1', rooms: quartos.slice(0, 2), dists: ['', '3'] }] : [] }
    : { modo, unico: [], grupos: [] };
  useStore.getState().setCircuitos(cfg);
  return useStore.getState();
}

const r1 = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n);
function resumo(state) {
  const r = calcularMateriais(state);
  const q = r.quadro;
  const nomes = new Map(state.rooms.map((x) => [x.id, `#${x.nome}`]));
  const cmp0 = compararCircuitos(state.rooms, state.equips, state.circuitos);
  // chaves de `cargas` são ids de cômodo (mudam a cada execução): trocadas pelo nome
  const cmp = { ...cmp0, cargas: Object.fromEntries(Object.entries(cmp0.cargas).map(([id, v]) => [nomes.get(id) ?? id, v])) };
  const html = gerarHtmlPdf(state).replace(/\d{2}[/-]\d{2}[/-]\d{4}/g, 'DD/MM/AAAA');
  return {
    circuitos: r.circuitos.map((c) => ({ nome: c.nome, tipo: c.tipo, comodo: c.comodo ?? null, potenciaW: r1(c.potenciaW), tensaoV: c.tensaoV, ligacao: c.ligacao, correnteA: r1(c.correnteA), bitolaMM2: c.bitolaMM2, disjuntorA: c.disjuntorA, comprimentoM: r1(c.comprimentoM), dr: !!c.dr })),
    quadro: Object.fromEntries(Object.entries(q).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v)).map(([k, v]) => [k, r1(v)])),
    materiais: r.materiais.map((m) => `${m.item} | ${m.qtd} ${m.unidade} | ${m.detalhe ?? ''}`),
    // ids de cômodo variam a cada execução: trocados pelo nome para o resultado ser comparável
    comparacao: JSON.parse(JSON.stringify(cmp, (k, v) => (typeof v === 'number' ? r1(v) : typeof v === 'string' ? (nomes.get(v) ?? (/^auto_/.test(v) ? 'auto' : v)) : v))),
    pdf: { tamanho: html.length, sha1: createHash('sha1').update(html).digest('hex') },
  };
}

const atual = {};
for (const nome of Object.keys(CASAS)) for (const modo of ['norma', 'economico', 'maximo', 'manual']) atual[`${nome} / ${modo}`] = resumo(montar(nome, modo));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };

t('o cálculo é determinístico (duas execuções iguais)', () => {
  assert.deepEqual(resumo(montar('B casa 6 comodos', 'economico')), atual['B casa 6 comodos / economico']);
});

if (process.env.UPDATE_SNAPSHOT === '1' || !existsSync(SNAP)) {
  mkdirSync(dirname(SNAP), { recursive: true });
  writeFileSync(SNAP, JSON.stringify(atual, null, 1) + '\n');
  console.log('snapshot gravado em tests/snapshots/rede-seguranca.json (' + Object.keys(atual).length + ' cenários)');
} else {
  const esperado = JSON.parse(readFileSync(SNAP, 'utf8'));
  t('mesmos cenários do snapshot', () => assert.deepEqual(Object.keys(atual), Object.keys(esperado)));
  for (const k of Object.keys(esperado)) {
    t(`resultado congelado: ${k}`, () => {
      assert.deepEqual(JSON.parse(JSON.stringify(atual[k])), esperado[k]);
    });
  }
}

t('cada casa gera circuitos e materiais (sem cenário vazio)', () => {
  for (const [k, v] of Object.entries(atual)) { assert.ok(v.circuitos.length > 0, k); assert.ok(v.materiais.length > 0, k); }
});
t('apagar um cômodo remove os circuitos e materiais dele em todos os modos', () => {
  for (const modo of ['norma', 'economico', 'maximo']) {
    const s = montar('B casa 6 comodos', modo);
    const serv = s.rooms.find((r) => r.nome === 'Área de serviço');
    useStore.getState().removeRoom(serv.id);
    const r = calcularMateriais(useStore.getState());
    assert.ok(!r.circuitos.some((c) => /Área de serviço/.test(c.nome + (c.comodo ?? ''))), modo);
  }
});
console.log(`${ok} testes OK`);
