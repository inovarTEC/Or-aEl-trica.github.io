/*
 * Equipamento que divide o circuito de tomadas do cômodo (etapa 3b): regras, avisos, cálculo, comparação e PDF.
 * Rodar: node tests/equip-circuito.test.mjs
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
const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais, tensaoEquipamento } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { compararCircuitos } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { gerarHtmlPdf } = loadTs(resolve(ROOT, 'lib/server/pdf-template.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { podeDividirCircuito } = loadTs(resolve(ROOT, 'lib/ponto-equip.ts'));
const { problemaEstrutura } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const T = Object.fromEntries(ROOM_TEMPLATES.map((x, i) => [x.label, i]));
let n = 0;
const casa = (equips) => {
  useStore.getState().resetState();
  const ids = {};
  for (const [tpl, nome, c, l] of [['Quarto típico', 'Quarto', '3.5', '3'], ['Área de serviço', 'Serviço', '3', '2.5'], ['Banheiro típico', 'Banheiro', '2.5', '2']]) {
    const r = novoComodo(ROOM_TEMPLATES[T[tpl]], useStore.getState().rooms, { nome, c, l }); r.dq = '8'; ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  for (const e of equips) useStore.getState().addEquip({ id: 'q' + (++n), room: ids[e.onde ?? 'Serviço'], tens: '127V', dint: '1', dist: '', alim: '', cx: '4x2', ...e });
  return { ids, st: useStore.getState() };
};
const nome = (r, re) => r.circuitos.find((c) => re.test(c.nome));
const bomba = { tipo: 'Bomba', pot: '368' };

t('padrão (circuito próprio): nada muda', () => {
  const { st } = casa([bomba]);
  const r = calcularMateriais(st);
  assert.ok(r.circuitos.some((c) => c.tipo === 'tue' && /Bomba/.test(c.nome)));
  assert.deepEqual(r.avisosEquip, []);
});
t('aparelho pequeno divide o circuito de tomadas do cômodo: some o disjuntor próprio e a potência entra no circuito', () => {
  const sep = calcularMateriais(casa([bomba]).st);
  const div = calcularMateriais(casa([{ ...bomba, circuito: 'comodo' }]).st);
  assert.equal(div.circuitos.length, sep.circuitos.length - 1);
  assert.ok(!div.circuitos.some((c) => c.tipo === 'tue'));
  const tugSep = nome(sep, /^Tomadas \(TUG\) — Serviço/), tugDiv = nome(div, /^Tomadas \(TUG\) — Serviço/);
  assert.equal(tugDiv.potenciaW, tugSep.potenciaW + 368);
  assert.match(tugDiv.nome, /\(\+ Bomba\)/);
  assert.equal(div.quadro.cargaTotalW, sep.quadro.cargaTotalW); // a carga total não muda, só o circuito
});
t('aparelho de aquecimento nunca divide (chuveiro, torneira, forno)', () => {
  for (const tipo of ['Chuveiro elétrico', 'Torneira elétrica', 'Forno elétrico']) {
    const r = calcularMateriais(casa([{ tipo, pot: '800', circuito: 'comodo', onde: 'Banheiro' }]).st);
    assert.ok(r.circuitos.some((c) => c.tipo === 'tue'), tipo);
    assert.match(r.avisosEquip[0], /circuito próprio/, tipo);
  }
});
t('acima de 10 A não divide', () => {
  const r = calcularMateriais(casa([{ tipo: 'Máquina de lavar', pot: '2200', circuito: 'comodo' }]).st);
  assert.ok(r.circuitos.some((c) => c.tipo === 'tue'));
  assert.match(r.avisosEquip[0], /acima de 10 A/);
});
t('tensão diferente da das tomadas (220 V em sistema 127 V) não divide', () => {
  const r = calcularMateriais(casa([{ ...bomba, tens: '220V', circuito: 'comodo' }]).st);
  assert.ok(r.circuitos.some((c) => c.tipo === 'tue'));
  assert.match(r.avisosEquip[0], /220 V.*127 V/);
});
t('soma acima do limite do circuito volta ao circuito próprio, com aviso', () => {
  const base = calcularMateriais(casa([]).st);
  const folga = 2500 - nome(base, /^Tomadas \(TUG\) — Serviço/).potenciaW; // quanto ainda cabe no circuito do serviço
  const pot = String(Math.floor(folga / 2) + 10); // 2 aparelhos não cabem juntos, 1 cabe
  const eqs = ['a', 'b', 'c'].map(() => ({ tipo: 'Bomba', pot, circuito: 'comodo' }));
  const r = calcularMateriais(casa(eqs).st);
  const proprios = r.circuitos.filter((c) => c.tipo === 'tue').length;
  assert.ok(proprios >= 1 && proprios < 3, `${proprios} próprios (folga ${folga}, pot ${pot})`);
  assert.ok(r.avisosEquip.some((a) => /passaria de 2500 VA/.test(a)));
  const tug = nome(r, /^Tomadas \(TUG\) — Serviço/);
  assert.ok(tug.potenciaW <= 2500 + 0, `circuito ${tug.potenciaW}`);
});
t('sem cômodo escolhido: circuito próprio e aviso', () => {
  const { st } = casa([{ ...bomba, circuito: 'comodo' }]);
  const r = calcularMateriais({ ...st, equips: st.equips.map((e) => ({ ...e, room: '' })) });
  assert.ok(r.circuitos.some((c) => c.tipo === 'tue'));
  assert.match(r.avisosEquip[0], /escolha o cômodo/);
});
t('apagar o cômodo do aparelho: sem circuito sobrando nem erro', () => {
  const { ids } = casa([{ ...bomba, circuito: 'comodo' }]);
  useStore.getState().removeRoom(ids.Serviço);
  const r = calcularMateriais(useStore.getState());
  assert.ok(!r.circuitos.some((c) => /Serviço/.test(c.nome)));
  const nDj = r.materiais.filter((m) => /^Disjuntor \d+A$/.test(m.item)).reduce((s, m) => s + m.qtd, 0);
  assert.equal(nDj, r.circuitos.length);
});
t('compararCircuitos desconta quem divide (com a tensão do sistema) e ignora sem ela', () => {
  const { st } = casa([{ ...bomba, circuito: 'comodo' }, { tipo: 'Chuveiro elétrico', pot: '5500', tens: '220V', onde: 'Banheiro' }]);
  const ctx = { fn: 127, tensaoEquip: (e) => tensaoEquipamento(e.tens, '220/127', 'Monofásico').v };
  const com = compararCircuitos(st.rooms, st.equips, st.circuitos, ctx);
  const sem = compararCircuitos(st.rooms, st.equips, st.circuitos);
  assert.equal(com.nTUE, 1); assert.equal(sem.nTUE, 2);
  assert.equal(com.modos.norma.disjuntores, sem.modos.norma.disjuntores - 1);
});
t('podeDividirCircuito: motivo claro para o leigo', () => {
  assert.equal(podeDividirCircuito({ tipo: 'Bomba', pot: '368', tens: '127V' }).ok, true);
  assert.match(podeDividirCircuito({ tipo: 'Chuveiro elétrico', pot: '5500', tens: '220V' }).motivo, /sempre tem circuito próprio/);
  assert.match(podeDividirCircuito({ tipo: 'Bomba', pot: '', tens: '' }).motivo, /informe a potência/);
});
t('validação do servidor aceita circuito "comodo"/"proprio" e recusa lixo', () => {
  const { st } = casa([{ ...bomba, circuito: 'comodo' }]);
  assert.equal(problemaEstrutura({ ...st }), null);
  assert.ok(problemaEstrutura({ ...st, equips: st.equips.map((e) => ({ ...e, circuito: 'xyz' })) }));
});
t('PDF mostra o aparelho dentro do circuito do cômodo e os avisos', () => {
  const html = gerarHtmlPdf(casa([{ ...bomba, circuito: 'comodo' }, { tipo: 'Chuveiro elétrico', pot: '800', circuito: 'comodo', onde: 'Banheiro' }]).st);
  assert.ok(html.includes('(+ Bomba)'));
  assert.ok(html.includes('Equipamentos: Chuveiro elétrico: fica em circuito próprio'));
});
t('tela: a avaliação diz, por aparelho, se divide, em qual circuito e por que não pode', () => {
  const { st } = casa([
    { ...bomba, circuito: 'comodo' },                               // divide (127 V, pequena)
    { tipo: 'Bomba', pot: '300', tens: '220V' },                    // 220 V em sistema 127 V: não pode
    { tipo: 'Chuveiro elétrico', pot: '5500', tens: '220V', onde: 'Banheiro' }, // aquecimento: não pode
    { tipo: 'Bomba', pot: '250', onde: 'Quarto' },                  // pode, mas está em circuito próprio (escolha da pessoa)
  ]);
  const ctx = { fn: 127, tensaoEquip: (e) => tensaoEquipamento(e.tens, '220/127', 'Monofásico').v };
  const cmp = compararCircuitos(st.rooms, st.equips, st.circuitos, ctx);
  const [a, b, c, d] = cmp.equipamentos;
  assert.ok(a.divide && a.alvo !== null && a.podeDividir);
  assert.ok(!b.divide && !b.podeDividir && /220 V.*127 V/.test(b.motivo));
  assert.ok(!c.divide && !c.podeDividir && /sempre tem circuito próprio/.test(c.motivo));
  assert.ok(!d.divide && d.podeDividir && d.motivo === '');
  assert.equal(cmp.nTUE, 3); // só a bomba que divide não ganha disjuntor
  // o circuito apontado por `alvo` é um circuito de tomadas (ou misto) que atende o cômodo do aparelho
  assert.notEqual(cmp.lista[a.alvo].tipo, 'luz');
  assert.ok(cmp.lista[a.alvo].rooms.includes(a.room));
});
t('tela: sem a tensão do sistema (ctx) nenhum aparelho aparece como "pode dividir"', () => {
  const { st } = casa([{ ...bomba }]);
  const cmp = compararCircuitos(st.rooms, st.equips, st.circuitos);
  assert.ok(cmp.equipamentos.every((x) => !x.podeDividir && /tensão do sistema/.test(x.motivo)));
});
console.log(`${ok} testes OK`);
