/*
 * Testes da instalação aparente (canaleta / eletroduto em metros / barras de 3 m), caixas de sobrepor
 * e eletroduto da entrada em barras de 3 m. Rodar: node tests/aparente.test.mjs
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


const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { materiaisEntrada, entradaPadrao } = loadTs(resolve(ROOT, 'lib/entrada-calc.ts'));
const { problemaEstrutura } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
let n = 0; const id = () => 'i' + (++n);
const room = (x = {}) => ({
  id: id(), base: 'Cozinha', nome: 'Cozinha', c: '4', l: '3', medE: false, via: '', dq: '10', dd: '', dr: '',
  dqE: false, ddE: false, drE: false, dpad: '1.5', dpadE: true,
  pontos: [
    { id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t: 'T10D' }] },
    { id: id(), h: 'media', d: '', cx: '4x4', mods: [{ id: id(), t: 'T20' }, { id: id(), t: 'USB' }] },
  ],
  luzes: [{ id: id(), d: '', cx: 'Redonda' }],
  comandos: [{ id: id(), t: 'IS', luzes: [], sws: [{ id: id(), h: 'media', d: '', tom: '', cx: '4x2' }] }],
  caixas: [], luzAuto: true, inst: 'Aparente', pe: '2.8', obs: '', ...x,
});
const estado = (rooms) => ({ id: 'x', imovel: 'Casa', obra: 'Reforma', cobertura: 'Laje', rede: 'Monofásico', rooms, equips: [] });
const soma = (mats, re) => mats.filter((m) => re.test(m.item)).reduce((a, m) => a + m.qtd, 0);
/** Metros e nº de circuitos por DN (para conferir as quantidades sem depender do DN calculado). */
const porDN = (circ) => {
  const m = {};
  for (const c of circ) { const a = m[c.eletrodutoDN] ?? { metros: 0, n: 0 }; a.metros += c.comprimentoM; a.n++; m[c.eletrodutoDN] = a; }
  return Object.values(m);
};

t('aparente sem material escolhido (orçamento antigo) = canaleta', () => {
  const r = calcularMateriais(estado([room()]));
  const g = porDN(r.circuitos);
  const barras = g.reduce((a, x) => a + Math.ceil(x.metros * 1.1 / 2), 0);
  assert.equal(soma(r.materiais, /^Canaleta PVC/), barras);
  assert.equal(soma(r.materiais, /^Emenda para canaleta/), g.reduce((a, x) => a + Math.max(0, Math.ceil(x.metros * 1.1 / 2) - 1), 0));
  assert.equal(soma(r.materiais, /^Curva 90° para canaleta/), r.circuitos.length * 2);
  assert.ok(soma(r.materiais, /^Bucha e parafuso para fixação de canaleta/) > 0);
  assert.equal(soma(r.materiais, /^Eletroduto/), 0);
});

t('aparente canaleta explícita = mesmo resultado do padrão', () => {
  const a = calcularMateriais(estado([room()])).materiais;
  const b = calcularMateriais(estado([room({ materialAparente: 'canaleta' })])).materiais;
  assert.deepEqual(b, a);
});

t('aparente eletroduto em metros: metros +10%, curvas 2/circuito, abraçadeira a cada 1 m', () => {
  const r = calcularMateriais(estado([room({ materialAparente: 'eletroduto_metro' })]));
  const g = porDN(r.circuitos);
  const metros = g.reduce((a, x) => a + Math.ceil(x.metros * 1.1), 0);
  const linhas = r.materiais.filter((m) => /^Eletroduto rígido PVC aparente \d+mm$/.test(m.item));
  assert.ok(linhas.length > 0 && linhas.every((m) => m.unidade === 'm'));
  assert.equal(soma(r.materiais, /^Eletroduto rígido PVC aparente \d+mm$/), metros);
  assert.equal(soma(r.materiais, /^Curva 90° \d+mm$/), r.circuitos.length * 2);
  assert.equal(soma(r.materiais, /^Abraçadeira tipo D/), metros);
  assert.equal(soma(r.materiais, /^Bucha e parafuso para abraçadeira/), metros);
  assert.equal(soma(r.materiais, /^Canaleta|^Luva de emenda|barra 3 m/), 0);
});

t('aparente eletroduto em barras de 3 m: barras, luvas (barras−1) e curvas por DN', () => {
  const r = calcularMateriais(estado([room({ materialAparente: 'eletroduto_peca3m' })]));
  const g = porDN(r.circuitos);
  const barras = g.reduce((a, x) => a + Math.ceil(x.metros * 1.1 / 3), 0);
  const luvas = g.reduce((a, x) => a + Math.max(0, Math.ceil(x.metros * 1.1 / 3) - 1), 0);
  assert.equal(soma(r.materiais, /^Eletroduto rígido PVC aparente \d+mm \(barra 3 m\)$/), barras);
  assert.ok(r.materiais.filter((m) => /barra 3 m/.test(m.item)).every((m) => /^barras?$/.test(m.unidade)));
  assert.equal(soma(r.materiais, /^Luva de emenda \d+mm$/), luvas);
  assert.equal(soma(r.materiais, /^Curva 90° \d+mm$/), r.circuitos.length * 2);
  assert.ok(soma(r.materiais, /^Abraçadeira tipo D/) > 0);
  assert.equal(soma(r.materiais, /^Canaleta/), 0);
});

t('cômodo aparente: condulete, tampa e tomadas/interruptores de sobrepor; sem caixa de embutir', () => {
  const m = calcularMateriais(estado([room({ materialAparente: 'eletroduto_peca3m' })])).materiais;
  assert.equal(soma(m, /^Caixa de sobrepor 4x2/), 2); // tomada + interruptor
  assert.equal(soma(m, /^Caixa de sobrepor 4x4/), 1);
  assert.equal(soma(m, /^Caixa octogonal de sobrepor/), 1); // luz
  assert.equal(soma(m, /^Tampa para condulete 4x2/), 2);
  assert.equal(soma(m, /^Tampa para condulete 4x4/), 1);
  assert.equal(soma(m, /^Tomada de sobrepor 2P\+T 10A/), 2); // T10D = 2 tomadas
  assert.equal(soma(m, /^Tomada de sobrepor 2P\+T 20A/), 1);
  assert.equal(soma(m, /^Tomada USB de sobrepor/), 1);
  assert.equal(soma(m, /^Interruptor de sobrepor/), 1);
  assert.equal(soma(m, /^Caixa de embutir|^Caixa redonda|^Placa/), 0);
});

t('cômodo embutido mantém caixa de embutir + placa e nada de sobrepor', () => {
  const m = calcularMateriais(estado([room({ inst: 'Embutida na parede', materialAparente: 'eletroduto_peca3m' })])).materiais;
  assert.equal(soma(m, /^Caixa de embutir 4x2/), 2);
  assert.equal(soma(m, /^Caixa de embutir 4x4/), 1);
  assert.equal(soma(m, /^Caixa redonda/), 1);
  assert.equal(soma(m, /^Placa 4x2/), 2);
  assert.equal(soma(m, /sobrepor|condulete|barra 3 m|Canaleta/i), 0);
  assert.ok(soma(m, /^Eletroduto flexível corrugado/) > 0);
});

t('cômodos mistos: cada um gera o seu material', () => {
  const m = calcularMateriais(estado([room(), room({ inst: 'Embutida na parede' }), room({ materialAparente: 'eletroduto_peca3m' })])).materiais;
  assert.ok(soma(m, /^Canaleta PVC/) > 0 && soma(m, /barra 3 m/) > 0 && soma(m, /^Eletroduto flexível/) > 0);
  assert.equal(soma(m, /^Caixa de sobrepor 4x2/), 4);
  assert.equal(soma(m, /^Caixa de embutir 4x2/), 2);
});

const qtdE = (itens, re) => itens.filter((m) => re.test(m.descricao)).reduce((a, m) => a + m.qtd, 0);
t('entrada subterrânea em metros (padrão) não muda', () => {
  const m = materiaisEntrada({ ...entradaPadrao(), tipoEntrada: 'subterranea', percurso: '35' });
  assert.equal(qtdE(m, /^Eletroduto rígido 1" para alimentador/), 39);
  assert.equal(qtdE(m, /barra 3 m|^Luva 1"|^Curva 90° 1"/), 0);
});

t('entrada subterrânea em barras de 3 m: ceil(35×1,1/3)=13 barras, 12 luvas, 2 curvas', () => {
  const m = materiaisEntrada({ ...entradaPadrao(), tipoEntrada: 'subterranea', percurso: '35', unidadeEletroduto: 'peca3m' });
  assert.equal(qtdE(m, /^Eletroduto rígido 1" \(barra 3 m\)/), 13);
  assert.equal(qtdE(m, /^Luva 1"$/), 12);
  assert.equal(qtdE(m, /^Curva 90° 1"$/), 2);
  assert.equal(qtdE(m, /para alimentador$/) - 13, 0); // não lança metros junto
});

t('entrada aérea ignora a unidade do eletroduto', () => {
  const m = materiaisEntrada({ ...entradaPadrao(), tipoEntrada: 'aerea', percurso: '35', unidadeEletroduto: 'peca3m' });
  assert.equal(qtdE(m, /^Eletroduto rígido|^Luva 1"|^Curva 90° 1"/), 0);
});

t('validação aceita os campos novos e rejeita valores inválidos', () => {
  const d = { ...estado([room({ materialAparente: 'eletroduto_metro' })]), entrada: { ...entradaPadrao(), unidadeEletroduto: 'peca3m' } };
  assert.equal(problemaEstrutura(d), null);
  assert.equal(problemaEstrutura(estado([room()])), null); // sem os campos (antigo)
  assert.ok(problemaEstrutura(estado([room({ materialAparente: 'xx' })])));
  assert.ok(problemaEstrutura({ ...estado([]), entrada: { ...entradaPadrao(), unidadeEletroduto: 'km' } }));
});

console.log(`\n${ok} testes OK`);
