/* ===== NBR 5410 — Tabelas de Referência ===== */

/**
 * Potência mínima de iluminação (VA) por área do cômodo (NBR 5410 / 9.5.2.1.1)
 * Até 6 m²: mínimo 100 VA
 * Acima de 6 m²: 100 VA para os primeiros 6 m² + 60 VA para cada 4 m² (ou fração) adicionais
 */
export function potenciaIluminacao(areaM2: number): number {
  if (areaM2 <= 0) return 100;
  if (areaM2 <= 6) return 100;
  const excedente = Math.ceil((areaM2 - 6) / 4);
  return 100 + excedente * 60;
}

/* minTomadas() foi movida para lib/nbr5410-regras.ts (usada também no navegador). */

/**
 * Potência atribuída por TUG (VA) — NBR 5410 / 9.5.2.2.2
 * Banheiro / Cozinha / Copa / Serviço / Lavanderia: 600 VA (até 3), 100 VA (demais)
 * Demais: 100 VA cada
 */
export function potenciaTUG(nTomadas: number, tipoCmodo: string): number {
  const t = tipoCmodo.toLowerCase();
  const especial = t.includes('banheiro') || t.includes('cozinha') || t.includes('copa') ||
    t.includes('servi') || t.includes('lavanderia') || t.includes('lavabo');
  if (!especial) return nTomadas * 100;
  const de600 = Math.min(nTomadas, 3);
  const de100 = Math.max(0, nTomadas - 3);
  return de600 * 600 + de100 * 100;
}

/* ---------- BITOLA / SEÇÃO DO CONDUTOR ---------- */

/**
 * Capacidade de condução de corrente (A) para condutor de cobre em PVC,
 * Método B1 (eletroduto embutido em parede) — 2 condutores carregados
 * Tabela 36 da NBR 5410
 */
const CONDUTOR_B1_2COND: { secao: number; cap: number }[] = [
  { secao: 0.5, cap: 9 },
  { secao: 0.75, cap: 11.5 },
  { secao: 1.0, cap: 14 },
  { secao: 1.5, cap: 17.5 },
  { secao: 2.5, cap: 24 },
  { secao: 4, cap: 32 },
  { secao: 6, cap: 41 },
  { secao: 10, cap: 57 },
  { secao: 16, cap: 76 },
  { secao: 25, cap: 101 },
  { secao: 35, cap: 125 },
  { secao: 50, cap: 151 },
  { secao: 70, cap: 192 },
];

/** 3 condutores carregados (trifásico) */
const CONDUTOR_B1_3COND: { secao: number; cap: number }[] = [
  { secao: 0.5, cap: 9 },
  { secao: 0.75, cap: 10 },
  { secao: 1.0, cap: 12 },
  { secao: 1.5, cap: 15.5 },
  { secao: 2.5, cap: 21 },
  { secao: 4, cap: 28 },
  { secao: 6, cap: 36 },
  { secao: 10, cap: 50 },
  { secao: 16, cap: 68 },
  { secao: 25, cap: 89 },
  { secao: 35, cap: 110 },
  { secao: 50, cap: 134 },
  { secao: 70, cap: 171 },
];

/**
 * Seção mínima por tipo de circuito (NBR 5410 / 6.2.6.1.1)
 * Iluminação: 1.5 mm²
 * TUG: 2.5 mm²
 * TUE (chuveiro, ar-cond, etc.): 2.5 mm²
 */
export function secaoMinima(tipoCircuito: 'iluminacao' | 'tug' | 'tue'): number {
  return tipoCircuito === 'iluminacao' ? 1.5 : 2.5;
}

/**
 * Escolhe a bitola (seção mm²) pelo critério de capacidade de corrente.
 * @param correnteA - corrente do circuito em Ampères
 * @param condCarregados - 2 (monofásico/bifásico) ou 3 (trifásico)
 * @param minSecao - seção mínima obrigatória
 */
function bitolaPorCorrente(correnteA: number, condCarregados: 2 | 3 = 2, minSecao: number = 1.5): number {
  const tab = condCarregados === 3 ? CONDUTOR_B1_3COND : CONDUTOR_B1_2COND;
  for (const row of tab) {
    if (row.secao >= minSecao && row.cap >= correnteA) return row.secao;
  }
  return 70; // se excede, retorna o máximo da tabela
}

/**
 * Escolhe a bitola considerando queda de tensão (máx 4% total, 2% por circuito terminal).
 * Fórmula simplificada: S ≥ (2 × ρ × L × I) / (ΔV)
 * ρ(cobre) = 0.0172 Ω·mm²/m, ΔV = tensão × 0.02 (2%)
 */
function bitolaPorQueda(correnteA: number, comprimentoM: number, tensao: number, condCarregados: 2 | 3 = 2): number {
  const rho = 0.0172; // resistividade do cobre
  const quedaMax = tensao * 0.02; // 2%
  if (quedaMax <= 0 || correnteA <= 0) return 1.5;
  const n = condCarregados === 3 ? Math.sqrt(3) : 2;
  const sNecessaria = (n * rho * comprimentoM * correnteA) / quedaMax;
  // Encontra a menor seção comercial ≥ sNecessaria
  const secoes = [0.5, 0.75, 1.0, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70];
  for (const s of secoes) {
    if (s >= sNecessaria) return s;
  }
  return 70;
}

/**
 * Escolhe a bitola final (o maior entre: mínima, por corrente e por queda)
 */
export function bitolaCircuito(
  potenciaW: number,
  tensao: number,
  comprimentoM: number,
  tipoCircuito: 'iluminacao' | 'tug' | 'tue',
  condCarregados: 2 | 3 = 2,
  fatorPotencia: number = 0.92
): { secao: number; corrente: number } {
  const corrente = potenciaW / (tensao * fatorPotencia * (condCarregados === 3 ? Math.sqrt(3) : 1));
  const sMin = secaoMinima(tipoCircuito);
  const sCorrente = bitolaPorCorrente(corrente, condCarregados, sMin);
  const sQueda = bitolaPorQueda(corrente, comprimentoM, tensao, condCarregados);
  const secao = Math.max(sMin, sCorrente, sQueda);
  return { secao, corrente: Math.round(corrente * 100) / 100 };
}

/* ---------- DISJUNTOR ---------- */

/** Correntes nominais comerciais de disjuntores (A) */
const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100];

/** Capacidade de condução do condutor pela seção (2 cond carregados, B1) */
function capCondutor(secao: number, cond: 2 | 3 = 2): number {
  const tab = cond === 3 ? CONDUTOR_B1_3COND : CONDUTOR_B1_2COND;
  const row = tab.find(r => r.secao === secao);
  return row?.cap ?? 100;
}

/**
 * Escolhe o disjuntor: In ≥ corrente do circuito e In ≤ capacidade do condutor
 */
export function disjuntor(corrente: number, secao: number, cond: 2 | 3 = 2): number {
  const cap = capCondutor(secao, cond);
  for (const d of DISJUNTORES) {
    if (d >= corrente && d <= cap) return d;
  }
  // Se nenhum cabe, pega o primeiro ≥ corrente
  for (const d of DISJUNTORES) {
    if (d >= corrente) return d;
  }
  return 100;
}

/* ---------- ELETRODUTO ---------- */

/**
 * Diâmetro nominal do eletroduto (mm) conforme número de condutores e seção.
 * Tabela 7 ABNT NBR 15465 / regra dos 40% (máximo 40% de ocupação).
 * Simplificação: até 3 condutores de 2.5 mm² → 20 mm; até 6 de 4 mm² → 25 mm; etc.
 */
const ELETRODUTO_NOMINAL = [
  { maxArea: 42, dn: 20 },  // 40% de π×10² = 125 → 42 mm² úteis  
  { maxArea: 78, dn: 25 },  // 40% de π×12.5² = 196
  { maxArea: 126, dn: 32 }, // 40% de π×16²
  { maxArea: 201, dn: 40 },
  { maxArea: 330, dn: 50 },
];

/** Área de seção transversal do condutor com isolação (mm² — aprox) */
function areaCondutor(secao: number): number {
  const map: Record<number, number> = {
    0.5: 5, 0.75: 6, 1.0: 7.6, 1.5: 9.8, 2.5: 13.9, 4: 18.1,
    6: 23.4, 10: 37.4, 16: 55.7, 25: 84.3, 35: 111, 50: 152, 70: 211,
  };
  return map[secao] ?? 14;
}

export function eletrodutoDN(secaoCondutor: number, nCondutores: number): number {
  const areaTotal = areaCondutor(secaoCondutor) * nCondutores;
  for (const row of ELETRODUTO_NOMINAL) {
    if (areaTotal <= row.maxArea) return row.dn;
  }
  return 50;
}

/* ---------- DISJUNTOR GERAL ---------- */

/**
 * Disjuntor geral do quadro: soma das correntes de todos os circuitos
 * com fator de demanda.
 */
export function disjuntorGeral(somaCorrentesA: number, rede: string): number {
  // Fator de demanda simplificado: 0.7 para residencial
  const fatorDemanda = 0.7;
  const corrente = somaCorrentesA * fatorDemanda;
  const polos = rede === 'Trifásico' ? 3 : rede === 'Bifásico' ? 2 : 1;
  // Corrente por polo
  const correntePolo = polos > 1 ? corrente / polos : corrente;
  for (const d of DISJUNTORES) {
    if (d >= correntePolo) return d;
  }
  return 100;
}

/* ---------- MATERIAIS ---------- */

export interface MaterialItem {
  item: string;
  qtd: number;
  unidade: string;
  detalhe?: string;
}

/** Número de condutores num circuito monofásico ou bifásico */
export function nCondutoresCircuito(tipo: 'iluminacao' | 'tug' | 'tue', rede: string): number {
  // iluminação: fase + neutro + terra + retorno(s) → contamos 3 (fase+neutro+terra)
  // TUG mono: fase + neutro + terra → 3
  // TUE 220V bifásico: 2 fases + terra → 3
  // Simplificação padrão: 3 condutores
  return 3;
}

/* POTENCIAS_TIPICAS foi movida para lib/nbr5410-regras.ts (pré-preenche a tela de equipamentos). */
