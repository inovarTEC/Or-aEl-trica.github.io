/* ===== Funções puras de dimensionamento (NBR 5410:2004) — reaproveitáveis na futura área do profissional ===== */

export const VERSAO_MOTOR = '2.0.0';

/** Sistema de tensões da rede da cidade. 'Não sei' é tratado como 220/127 V (com aviso no PDF). */
export type SistemaTensao = '220/127' | '380/220';

export function normalizarSistema(v: string | undefined | null): SistemaTensao {
  return v === '380/220' ? '380/220' : '220/127';
}

/** Tensões fase-neutro e fase-fase de cada sistema (só existe 127 V em 220/127; nunca 110 V). */
export function tensoesSistema(s: SistemaTensao): { fn: number; ff: number } {
  return s === '380/220' ? { fn: 220, ff: 380 } : { fn: 127, ff: 220 };
}

/* ---------- 4.2 Iluminação ---------- */

/** NBR 5410 9.5.2.1.2: ≤ 6 m² → 100 VA; acima, +60 VA por 4 m² INTEIROS. */
export function cargaMinimaIluminacao(areaM2: number): number {
  if (!(areaM2 > 6)) return 100;
  return 100 + 60 * Math.floor((areaM2 - 6) / 4);
}

/** Potência usada: a maior entre a mínima da norma e 100 VA por ponto declarado. */
export function potenciaIluminacao(areaM2: number, nPontos: number): number {
  return Math.max(cargaMinimaIluminacao(areaM2), 100 * Math.max(0, nPontos));
}

/* ---------- 4.3 Tomadas ---------- */

const norm = (t: string) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Ambientes com 600 VA por ponto (NBR 5410 9.5.2.2.2 a). */
export function ehAreaMolhada600(tipo: string): boolean {
  const t = norm(tipo);
  return ['banheiro', 'lavabo', 'cozinha', 'copa', 'servico', 'lavanderia'].some((k) => t.includes(k));
}

/** NBR 5410 9.5.2.2.2: 600 VA por ponto até 3 pontos e 100 VA nos demais (molhadas); 100 VA nos outros. */
export function potenciaTUG(nPontos: number, tipo: string): number {
  const n = Math.max(0, nPontos);
  if (!ehAreaMolhada600(tipo)) return n * 100;
  return Math.min(n, 3) * 600 + Math.max(0, n - 3) * 100;
}

/** NBR 5410 9.5.3.2: tomadas de cozinha/copa/serviço/lavanderia ficam em circuitos exclusivos desses locais. */
export function ehCozinhaServico(tipo: string): boolean {
  const t = norm(tipo);
  return ['cozinha', 'copa', 'servico', 'lavanderia'].some((k) => t.includes(k));
}

/** NBR 5410 5.1.3.2.2: locais cujos circuitos exigem DR de 30 mA. */
export function exigeDR(tipo: string): boolean {
  const t = norm(tipo);
  return ['banheiro', 'lavabo', 'cozinha', 'copa', 'servico', 'lavanderia', 'garagem', 'varanda', 'externa', 'quintal', 'piscina', 'terraco']
    .some((k) => t.includes(k));
}

/* ---------- 4.6 Corrente, cabo, disjuntor e queda de tensão ---------- */

/** IB = P ÷ (V × fp); trifásico: P ÷ (√3 × Vff × fp). */
export function correnteProjeto(potencia: number, tensao: number, fp = 1, trifasico = false): number {
  if (!(potencia > 0) || !(tensao > 0)) return 0;
  return potencia / ((trifasico ? Math.sqrt(3) : 1) * tensao * (fp > 0 ? fp : 1));
}

/** NBR 5410 Tabela 47: 1,5 mm² iluminação; 2,5 mm² tomadas e equipamentos. */
export function secaoMinima(tipo: 'iluminacao' | 'tug' | 'tue'): number {
  return tipo === 'iluminacao' ? 1.5 : 2.5;
}

/** NBR 5410 Tabela 36 — cobre, PVC 70 °C, método B1, 30 °C (A). */
export const CAPACIDADE_B1: { secao: number; c2: number; c3: number }[] = [
  { secao: 1.5, c2: 17.5, c3: 15.5 },
  { secao: 2.5, c2: 24, c3: 21 },
  { secao: 4, c2: 32, c3: 28 },
  { secao: 6, c2: 41, c3: 36 },
  { secao: 10, c2: 57, c3: 50 },
  { secao: 16, c2: 76, c3: 68 },
  { secao: 25, c2: 101, c3: 89 },
  { secao: 35, c2: 125, c3: 110 },
];

/** NBR 5410 Tabela 42, linha 1 (feixe em eletroduto). */
export function fatorAgrupamento(nCircuitos: number): number {
  const n = Math.max(1, Math.floor(nCircuitos));
  const tab = [1, 1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52];
  if (n <= 8) return tab[n];
  if (n <= 11) return 0.5;
  if (n <= 15) return 0.45;
  if (n <= 19) return 0.41;
  return 0.38;
}

/** Correntes nominais comerciais de disjuntor (A). */
export const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63];
/** Decisão 10.1 (premissa): disjuntor mínimo de 10 A em TUG e iluminação. */
export const DISJUNTOR_MIN_TUG_ILUM = 10;
/** Decisão 10.2 (premissa): meta de 3% no circuito terminal (NBR 5410 6.2.7.2 admite até 4%). */
export const META_QUEDA = 3;
/** Resistividade do cobre a 70 °C (Ω·mm²/m). */
export const RHO_COBRE_70 = 0.0225;

/** ΔV% = 100 × k × ρ × L × IB ÷ (S × V); k = 2 (monofásico) ou √3 (trifásico). */
export function quedaTensao(ib: number, comprimentoM: number, secao: number, tensao: number, trifasico = false): number {
  if (!(secao > 0) || !(tensao > 0)) return 0;
  return (100 * (trifasico ? Math.sqrt(3) : 2) * RHO_COBRE_70 * Math.max(0, comprimentoM) * ib) / (secao * tensao);
}

export interface Dimensionamento {
  ib: number;
  secao: number;
  iz: number;
  disjuntor: number;
  queda: number;
  /** true se nenhuma combinação da tabela atende (precisa de profissional). */
  foraDaTabela: boolean;
}

/**
 * NBR 5410 6.2.6 / 5.3.4 / 6.2.7: menor seção ≥ mínima em que existe disjuntor comercial com IB ≤ In ≤ Iz
 * (Iz já corrigida pelo agrupamento) e queda ≤ meta. Se não houver, sobe a seção.
 */
export function dimensionarCircuito(p: {
  potencia: number; tensao: number; fp?: number; tipo: 'iluminacao' | 'tug' | 'tue';
  comprimentoM: number; nAgrupados?: number; trifasico?: boolean; metaQueda?: number;
}): Dimensionamento {
  const tri = !!p.trifasico;
  const ib = correnteProjeto(p.potencia, p.tensao, p.fp ?? 1, tri);
  const fa = fatorAgrupamento(p.nAgrupados ?? 1);
  const minIn = DISJUNTOR_MIN_TUG_ILUM; // decisão 10.1: mínimo de 10 A em todos os circuitos terminais
  const meta = p.metaQueda ?? META_QUEDA;
  const sMin = secaoMinima(p.tipo);
  for (const row of CAPACIDADE_B1) {
    if (row.secao < sMin) continue;
    const iz = (tri ? row.c3 : row.c2) * fa;
    const In = DISJUNTORES.find((d) => d >= ib && d >= minIn && d <= iz);
    if (In === undefined) continue;
    const queda = quedaTensao(ib, p.comprimentoM, row.secao, p.tensao, tri);
    if (queda > meta) continue;
    return { ib, secao: row.secao, iz, disjuntor: In, queda, foraDaTabela: false };
  }
  const ult = CAPACIDADE_B1[CAPACIDADE_B1.length - 1];
  const iz = (tri ? ult.c3 : ult.c2) * fa;
  return {
    ib, secao: ult.secao, iz, disjuntor: DISJUNTORES.find((d) => d >= ib) ?? DISJUNTORES[DISJUNTORES.length - 1],
    queda: quedaTensao(ib, p.comprimentoM, ult.secao, p.tensao, tri), foraDaTabela: true,
  };
}

/* ---------- 4.7 Eletroduto (A VALIDAR — decisão 10.7) ---------- */

/** Área externa aproximada do cabo (mm²) — valores atuais do app, A VALIDAR por profissional. */
export function areaCabo(secao: number): number {
  const m: Record<number, number> = { 1.5: 9.8, 2.5: 13.9, 4: 18.1, 6: 23.4, 10: 37.4, 16: 55.7, 25: 84.3, 35: 111 };
  return m[secao] ?? 14;
}
/** Área útil (mm²) a 40% por diâmetro nominal — tabela atual do app, A VALIDAR. */
const AREA_UTIL_40: { dn: number; area: number }[] = [
  { dn: 20, area: 42 }, { dn: 25, area: 78 }, { dn: 32, area: 126 }, { dn: 40, area: 201 }, { dn: 50, area: 330 },
];
/** NBR 5410 6.2.11.1.6 a): ocupação máxima 53% (1 cabo), 31% (2 cabos), 40% (3 ou mais). */
export function taxaOcupacao(nCabos: number): number {
  return nCabos <= 1 ? 0.53 : nCabos === 2 ? 0.31 : 0.4;
}
export function eletrodutoPorOcupacao(cabos: { secao: number; n: number }[]): number {
  const n = cabos.reduce((s, c) => s + c.n, 0);
  const area = cabos.reduce((s, c) => s + areaCabo(c.secao) * c.n, 0);
  const k = taxaOcupacao(n) / 0.4;
  return AREA_UTIL_40.find((r) => area <= r.area * k)?.dn ?? 50;
}
/** NBR 5410 6.2.11.1.6 b): trecho sem caixa ≤ 15 m, menos 3 m por curva de 90°. */
export function trechoMaximoSemCaixa(curvas90: number): number {
  return Math.max(0, 15 - 3 * Math.max(0, curvas90));
}

/* ---------- 4.9 Caixas ---------- */

/** Decisão 10.5: até 3 módulos = 4x2; 4 a 6 = 4x4; acima de 6 divide em duas caixas (aviso). */
export function caixaPorModulos(modulos: number): '4x2' | '4x4' | 'dividir' {
  if (modulos <= 3) return '4x2';
  if (modulos <= 6) return '4x4';
  return 'dividir';
}

/* ---------- 4.10 Quadro ---------- */

/** NBR 5410 Tabela 59: reserva do quadro. */
export function reservaQuadro(nCircuitos: number): number {
  if (nCircuitos <= 6) return 2;
  if (nCircuitos <= 12) return 3;
  if (nCircuitos <= 30) return 4;
  return Math.ceil(0.15 * nCircuitos);
}
export const TAMANHOS_QUADRO = [12, 18, 24, 34, 44];
export function tamanhoQuadro(modulos: number): number | null {
  return TAMANHOS_QUADRO.find((t) => t >= modulos) ?? null;
}
/** Correntes nominais de DR consideradas (A). */
export const DR_NOMINAIS = [25, 40, 63];
