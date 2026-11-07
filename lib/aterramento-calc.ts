/* Regras da Etapa 8 — aterramento principal (usado pelo wizard e pela prévia no servidor). */
import type { AterramentoPrincipal } from './types';

export function aterramentoPadrao(): AterramentoPrincipal {
  return { nHastes: 3, comprimentoHaste: '2.4', nCaixasInspecao: 1, bitolaCabo: '6', distancia: '', obs: '' };
}

export interface MaterialAterramento {
  descricao: string;
  qtd: number;
  unidade: string;
  mostrarNaPrevia: boolean; // false = reservado ao PDF
}

export function materiaisAterramento(a: AterramentoPrincipal): MaterialAterramento[] {
  const dist = parseFloat(a.distancia) || 0;
  const comp = a.comprimentoHaste.replace('.', ',');
  const items: MaterialAterramento[] = [
    { descricao: `Haste de aterramento ${comp} m`, qtd: a.nHastes, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Conector de haste de aterramento', qtd: a.nHastes, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Caixa de inspeção de aterramento', qtd: a.nCaixasInspecao, unidade: 'un', mostrarNaPrevia: true },
  ];
  // Cabo: reservado ao PDF (a prévia gratuita não mostra bitola).
  if (dist > 0) {
    items.push({ descricao: `Cabo ${a.bitolaCabo} mm² (aterramento principal)`, qtd: Math.ceil(dist * 1.1), unidade: 'm', mostrarNaPrevia: false });
  }
  return items;
}

export interface AvisoAterramento { tipo: 'aviso' | 'info'; msg: string }

export function avisosAterramento(a: AterramentoPrincipal): AvisoAterramento[] {
  const avisos: AvisoAterramento[] = [];
  if (!a.distancia) avisos.push({ tipo: 'aviso', msg: 'Informe a distância até o ponto de aterramento para calcular o cabo.' });
  if (a.nHastes < 3) avisos.push({ tipo: 'info', msg: 'A proposta padrão usa 3 hastes. Consulte um eletricista para validar o número adequado.' });
  if (a.nCaixasInspecao < 1) avisos.push({ tipo: 'aviso', msg: 'É necessária ao menos 1 caixa de inspeção.' });
  return avisos;
}
