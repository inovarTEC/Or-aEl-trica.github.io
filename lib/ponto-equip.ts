/* Ponto do equipamento (caixa + o que vai nela) — cálculo local da prévia gratuita, sem bitola/disjuntor/cabo. */
import type { Equip, Room, TipoEquip } from './types';

export type PontoEquip = NonNullable<Equip['ponto']>;

export const PONTO_LABEL: Record<PontoEquip, string> = {
  T20: 'Tomada 20A simples',
  T20D: 'Tomada 20A dupla',
  borne: 'Borne/terminal',
  tampa: 'Tampa cega',
};

/** Sugestão visual (não aplicada automaticamente). */
export function pontoSugerido(tipo: TipoEquip | string): PontoEquip | null {
  if (tipo === 'Chuveiro elétrico' || tipo === 'Torneira elétrica') return 'borne';
  if (['Ar-condicionado', 'Forno elétrico', 'Cooktop elétrico', 'Máquina de lavar', 'Secadora',
    'Carregador de veículo elétrico'].includes(tipo)) return 'T20';
  return null;
}

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };

/** Trajeto do quadro ao cômodo (mesma regra do calculator: dq, ou dd + dr quando passa por outro cômodo). */
const rotaComodo = (r: Room) => (r?.via ? num(r.dd) + num(r.dr) : num(r.dq));

/**
 * Distância considerada para o equipamento: a direta ao quadro, se informada; senão trajeto do cômodo + dint.
 * Sem cômodo e sem distância → 0 com origem 'nenhuma' (a tela avisa; sem fallback silencioso).
 */
export function distanciaEquip(e: Equip, rooms: Room[]): { metros: number; origem: 'direta' | 'comodo' | 'nenhuma' } {
  const direta = num(e?.dist);
  if (direta > 0) return { metros: direta, origem: 'direta' };
  const room = (rooms ?? []).find((r) => r?.id === e?.room);
  if (room) return { metros: Math.round((rotaComodo(room) + num(e?.dint)) * 10) / 10, origem: 'comodo' };
  return { metros: 0, origem: 'nenhuma' };
}

export function resumoPonto(e: Equip): { caixa: string; ponto: string; caixas: number } {
  return { caixa: e?.cx ?? '4x2', ponto: e?.ponto ? PONTO_LABEL[e.ponto] : 'não definido', caixas: 1 };
}
