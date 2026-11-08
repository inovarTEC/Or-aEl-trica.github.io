/* ===== Eletroduto (ocupação, A VALIDAR — decisão 10.7) e tipo de item de material ===== */


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

export interface MaterialItem {
  item: string;
  qtd: number;
  unidade: string;
  detalhe?: string;
}
