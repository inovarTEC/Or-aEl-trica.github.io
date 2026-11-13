/* ===== Divisão de circuitos — config e classificação dos cômodos (sem fórmulas; seguro no navegador) ===== */
import type { ConfigCircuitos, GrupoCircuito, Room } from './types';

export const configPadrao = (): ConfigCircuitos => ({ modo: 'norma', unico: [], grupos: [] });

/**
 * Classe do cômodo para dividir circuito (regra conservadora do app — conferir com a NBR 5410):
 *  - servico: cozinha, copa, área de serviço, lavanderia → tomadas em circuito exclusivo desses locais (9.5.3.2);
 *    só se juntam entre si e nunca com iluminação no mesmo disjuntor.
 *  - isolado: banheiro, lavabo, garagem, varanda, áreas externas → exigem DR (5.1.3.2.2): circuito próprio.
 *  - comum: sala, quartos, corredor etc.
 */
export type ClasseCircuito = 'comum' | 'servico' | 'isolado';

const sem = (t: string) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function classeCircuito(r: Pick<Room, 'base' | 'nome'>): ClasseCircuito {
  const t = sem(`${r?.base ?? ''} ${r?.nome ?? ''}`);
  if (/cozinha|copa|servico|lavanderia/.test(t)) return 'servico';
  if (/banheiro|lavabo|garagem|varanda|externa|quintal|piscina|terraco/.test(t)) return 'isolado';
  return 'comum';
}

/** Tira da config os cômodos que não existem mais e desfaz grupos com menos de 2 cômodos. */
export function podarConfig(cfg: ConfigCircuitos | undefined, rooms: Pick<Room, 'id'>[]): ConfigCircuitos {
  const base = cfg && typeof cfg === 'object' ? cfg : configPadrao();
  const ids = new Set((rooms ?? []).map((r) => r?.id));
  const grupos: GrupoCircuito[] = [];
  for (const g of base.grupos ?? []) {
    const rs: string[] = [], ds: string[] = [];
    (g?.rooms ?? []).forEach((id, i) => { if (ids.has(id)) { rs.push(id); ds.push(rs.length === 1 ? '' : String(g?.dists?.[i] ?? '')); } });
    if (rs.length >= 2) grupos.push({ id: String(g.id), rooms: rs, dists: ds, ...(g.unico ? { unico: true } : {}) });
  }
  return {
    modo: base.modo ?? 'norma',
    unico: (base.unico ?? []).filter((id) => ids.has(id)),
    grupos,
  };
}
