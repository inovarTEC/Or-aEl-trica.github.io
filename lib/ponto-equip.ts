/* Ponto do equipamento (caixa + o que vai nela) — cálculo local da prévia gratuita, sem bitola/disjuntor/cabo. */
import type { Equip, Room, TipoEquip } from './types';
import { num, routeLen } from './util';

export type PontoEquip = NonNullable<Equip['ponto']>;

export const PONTO_LABEL: Record<PontoEquip, string> = {
  T20: 'Tomada 20A simples',
  T20D: 'Tomada 20A dupla',
  borne: 'Borne/terminal',
  tampa: 'Tampa cega',
  emenda: 'Emenda / Conector Wago (ligação direta)',
};

/** Cargas resistivas (fp = 1,0): chuveiro, torneira elétrica, ferro, aquecedor de passagem, boiler. */
const RESISTIVA = /chuveiro|torneira|ferro|aquecedor|boiler/i;

/** Fator de potência da carga: 1,0 para resistivas; 0,92 para as demais (motores, compressores, eletrônicos). */
export function fpEquip(tipo?: string): number {
  return RESISTIVA.test(String(tipo ?? '')) ? 1 : 0.92;
}

/** Corrente estimada (A): I = P / (V × fp). Bivolt usa 127 V (conservador). Sem dados → null. */
export function correnteEquip(pot: string | undefined, tens: string | undefined, tipo?: string): number | null {
  const p = parseFloat(String(pot ?? ''));
  const t = String(tens ?? '').toLowerCase() === 'bivolt' ? 127 : parseFloat(String(tens ?? ''));
  if (!(p > 0) || !(t > 0)) return null;
  return p / (t * fpEquip(tipo));
}

export type AvisoCorrente = 'ok' | 'prefira20A' | 'ligacaoDireta';

/** ≤10 A: tomada 10A/20A ok · ≤16 A: prefira 20A · >16 A: ligação direta (tampa cega + emenda/Wago). */
export function avisoCorrente(I: number): AvisoCorrente {
  if (I <= 10) return 'ok';
  if (I <= 16) return 'prefira20A';
  return 'ligacaoDireta';
}

/** Sugestão visual (não aplicada automaticamente). A corrente, quando informada, tem prioridade sobre o tipo. */
export function pontoSugerido(tipo: TipoEquip | string, pot?: string, tens?: string): PontoEquip | null {
  const I = correnteEquip(pot, tens, tipo);
  if (I !== null && avisoCorrente(I) === 'ligacaoDireta') {
    return tipo === 'Chuveiro elétrico' || tipo === 'Torneira elétrica' ? 'borne' : 'emenda';
  }
  if (tipo === 'Chuveiro elétrico' || tipo === 'Torneira elétrica') return 'borne';
  if (['Ar-condicionado', 'Forno elétrico', 'Cooktop elétrico', 'Máquina de lavar', 'Secadora',
    'Carregador de veículo elétrico'].includes(tipo)) return 'T20';
  return null;
}


/**
 * Distância considerada para o equipamento: a direta ao quadro, se informada; senão trajeto do cômodo + dint.
 * Sem cômodo e sem distância → 0 com origem 'nenhuma' (a tela avisa; sem fallback silencioso).
 */
export function distanciaEquip(e: Equip, rooms: Room[]): { metros: number; origem: 'direta' | 'comodo' | 'nenhuma' } {
  const direta = num(e?.dist);
  if (direta > 0) return { metros: direta, origem: 'direta' };
  const room = (rooms ?? []).find((r) => r?.id === e?.room);
  if (room) return { metros: Math.round((routeLen(room) + num(e?.dint)) * 10) / 10, origem: 'comodo' };
  return { metros: 0, origem: 'nenhuma' };
}

export function resumoPonto(e: Equip): { caixa: string; ponto: string; caixas: number } {
  return { caixa: e?.cx ?? '4x2', ponto: e?.ponto ? PONTO_LABEL[e.ponto] : 'não definido', caixas: 1 };
}
