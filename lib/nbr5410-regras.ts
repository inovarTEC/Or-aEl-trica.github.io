/* ===== NBR 5410 — regras simples usadas no navegador E no servidor (sem cálculo pago) ===== */

/**
 * Quantas tomadas físicas um módulo representa: simples/USB = 1, dupla (…D) = 2, tripla (…T) = 3.
 * Fonte única usada na prévia (countMods) e na conferência da NBR 5410 (tomadasNbr).
 */
export function tomadasFisicas(t: string | undefined | null): number {
  const s = String(t ?? '');
  if (/^T\d+T$/.test(s)) return 3;
  if (/^T\d+D$/.test(s)) return 2;
  return s ? 1 : 0;
}

export const perimetro = (c: number, l: number): number => 2 * (c + l);

/**
 * Número mínimo de pontos de tomada de uso geral (TUG) por cômodo — NBR 5410, 9.5.2.2.1.
 *  - Banheiro/lavabo: pelo menos 1 (próximo ao lavatório)
 *  - Cozinha/copa/área de serviço/lavanderia: 1 a cada 3,5 m de perímetro, ou fração
 *  - Varanda: pelo menos 1
 *  - Sala/quarto/dormitório: 1 a cada 5 m de perímetro, ou fração
 *  - Demais: 1 se área ≤ 6 m²; acima disso, 1 a cada 5 m de perímetro, ou fração
 * "Ou fração" = arredonda para cima (Math.ceil).
 */
export function minTomadas(areaM2: number, perimetroM: number, tipoComodo: string): number {
  const t = (tipoComodo ?? '').toLowerCase();
  const p = Math.max(0, perimetroM || 0);
  if (t.includes('banheiro') || t.includes('lavabo')) return 1;
  if (t.includes('cozinha') || t.includes('copa') || t.includes('servi') || t.includes('lavanderia')) {
    return Math.max(1, Math.ceil(p / 3.5));
  }
  if (t.includes('varanda')) return 1;
  if (t.includes('sala') || t.includes('quarto') || t.includes('dormit')) return Math.max(1, Math.ceil(p / 5));
  if (areaM2 <= 6) return 1;
  return Math.max(1, Math.ceil(p / 5));
}

/** Potência/tensão típicas — usadas para pré-preencher o equipamento quando o usuário escolhe o tipo. */
export const POTENCIAS_TIPICAS: Record<string, { pot: number; tens: number }> = {
  'Chuveiro elétrico': { pot: 5500, tens: 220 },
  'Torneira elétrica': { pot: 3200, tens: 220 },
  'Ar-condicionado': { pot: 1400, tens: 220 },
  'Forno elétrico': { pot: 1500, tens: 127 },
  'Cooktop elétrico': { pot: 2000, tens: 220 },
  'Máquina de lavar': { pot: 1200, tens: 127 },
  'Secadora': { pot: 3200, tens: 220 },
  'Aquecedor': { pot: 4500, tens: 220 },
  'Bomba': { pot: 750, tens: 220 },
  'Carregador de veículo elétrico': { pot: 7400, tens: 220 },
};
