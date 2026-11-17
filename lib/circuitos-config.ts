/* ===== Divisão de circuitos — config e classificação dos cômodos (sem fórmulas; seguro no navegador) ===== */
import type { CircuitoManual, ConfigCircuitos, GrupoCircuito, Room } from './types';

/** Padrão ao abrir: luz e tomadas juntas onde for permitido (o modo "separado" não é mais oferecido; vive só como base de comparação no servidor). */
export const configPadrao = (): ConfigCircuitos => ({ modo: 'economico', unico: [], grupos: [] });

/** Orçamento salvo no modo "separado" (norma) passa para o padrão atual. */
export const migrarModo = (cfg: ConfigCircuitos): ConfigCircuitos => (cfg.modo === 'norma' ? { ...cfg, modo: 'economico' } : cfg);

/**
 * Classe do cômodo para dividir circuito (conferir com a NBR 5410):
 *  - comum: sala, quartos, corredor etc.
 *  - banheiro: banheiro e lavabo. Pode dividir circuito com cômodos comuns (carga pequena); o circuito leva DR (5.1.3.2.2).
 *  - servico: cozinha, copa, área de serviço, lavanderia → tomadas em circuito exclusivo desses locais (9.5.3.2):
 *    só dividem tomadas entre si e nunca com iluminação no mesmo disjuntor. A iluminação pode dividir com qualquer cômodo.
 *  - externo: garagem, varanda, quintal, piscina, terraço, áreas externas → DR; tomadas dividem com os demais só com aviso.
 */
export type ClasseCircuito = 'comum' | 'banheiro' | 'servico' | 'externo';

const sem = (t: string) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function classeCircuito(r: Pick<Room, 'base' | 'nome'>): ClasseCircuito {
  const t = sem(`${r?.base ?? ''} ${r?.nome ?? ''}`);
  if (/cozinha|copa|servico|lavanderia/.test(t)) return 'servico';
  if (/banheiro|lavabo/.test(t)) return 'banheiro';
  if (/garagem|varanda|externa|quintal|piscina|terraco/.test(t)) return 'externo';
  return 'comum';
}

/** Luz e tomadas no mesmo disjuntor: só cômodos comuns e banheiros (cozinha/serviço têm tomadas exclusivas). */
export const aceitaMisto = (c: ClasseCircuito): boolean => c === 'comum' || c === 'banheiro';

/** Duas classes podem dividir um circuito de TOMADAS? sim · confirmar (permitido, com aviso e DR) · nao. */
export type Compat = 'sim' | 'confirmar' | 'nao';
export function tomadasCompativeis(a: ClasseCircuito, b: ClasseCircuito): Compat {
  if (a === 'servico' || b === 'servico') {
    if (a === b) return 'sim';
    return (a === 'servico' ? b : a) === 'externo' ? 'confirmar' : 'nao';
  }
  if (a === 'externo' || b === 'externo') return a === b ? 'sim' : 'confirmar';
  return 'sim'; // comum e banheiro
}

/** Tira da config os cômodos que não existem mais e desfaz grupos com menos de 2 cômodos. */
export function podarConfig(cfg: ConfigCircuitos | undefined, rooms: Pick<Room, 'id'>[]): ConfigCircuitos {
  // Sem configuração (orçamento antigo chegando direto ao servidor): comportamento histórico "separado"; a tela já abre em economico (configPadrao).
  const base: ConfigCircuitos = cfg && typeof cfg === 'object' ? cfg : { modo: 'norma', unico: [], grupos: [] };
  const ids = new Set((rooms ?? []).map((r) => r?.id));
  const grupos: GrupoCircuito[] = [];
  for (const g of base.grupos ?? []) {
    const rs: string[] = [], ds: string[] = [];
    (g?.rooms ?? []).forEach((id, i) => { if (ids.has(id)) { rs.push(id); ds.push(rs.length === 1 ? '' : String(g?.dists?.[i] ?? '')); } });
    if (rs.length >= 2) grupos.push({ id: String(g.id), rooms: rs, dists: ds, ...(g.unico ? { unico: true } : {}) });
  }
  // Lista personalizada: só cômodos que existem; circuito sem cômodo some.
  const lista: CircuitoManual[] = [];
  for (const it of base.lista ?? []) {
    if (!it || !['luz', 'tomadas', 'misto'].includes(it.tipo)) continue;
    const rs: string[] = [], ds: string[] = [];
    (it.rooms ?? []).forEach((id, i) => { if (ids.has(id)) { rs.push(id); ds.push(rs.length === 1 ? '' : String(it.dists?.[i] ?? '')); } });
    if (rs.length >= 1) lista.push({ id: String(it.id), tipo: it.tipo, rooms: rs, dists: ds });
  }
  return {
    modo: base.modo ?? 'norma',
    unico: (base.unico ?? []).filter((id) => ids.has(id)),
    grupos,
    ...(base.modo === 'personalizado' ? { lista } : {}),
  };
}
