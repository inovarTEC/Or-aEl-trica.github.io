import { calcularMateriais, sistemaDoEstado, tensaoEquipamento } from '@/lib/server/calc-materiais';
import { entradaPadrao } from '@/lib/entrada-calc';
import { tensoesSistema } from '@/lib/motor/eletrica';
import { compararCircuitos } from '@/lib/server/circuitos';
import { ok } from '@/lib/server/pedido';
import { exigirDados, lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Compara as formas de dividir os circuitos (padrão, econômico, mais econômico) para a tela "Circuitos do quadro". */
export const POST = rota('circuitos', async (req) => {
  const corpo = await lerCorpo(req);
  const dados = exigirDados(corpo?.dados, false);
  const sistema = sistemaDoEstado({ entrada: dados.entrada ?? entradaPadrao() });
  const rede = dados.rede || 'Monofásico';
  const ctx = { fn: tensoesSistema(sistema).fn, tensaoEquip: (e: any) => tensaoEquipamento(e.tens, sistema, rede).v };
  const cmp = compararCircuitos(dados.rooms, dados.equips ?? [], dados.circuitos, ctx);
  // Dimensionamento de cada circuito (disjuntor, bitola, corrente) para a lista da tela, na mesma ordem de `cmp.lista`.
  let detalhes: { nome: string; tipo: string; potenciaW: number; correnteA: number; disjuntorA: number; bitolaMM2: number; comprimentoM: number; dr: boolean }[] = [];
  try {
    detalhes = calcularMateriais(dados as any).circuitos
      .map((c) => ({ nome: c.nome, tipo: c.tipo, potenciaW: c.potenciaW, correnteA: c.correnteA, disjuntorA: c.disjuntorA, bitolaMM2: c.bitolaMM2, comprimentoM: c.comprimentoM, dr: !!c.dr }));
  } catch { /* sem o dimensionamento a lista aparece só com os nomes */ }
  return ok({ ...cmp, detalhes });
});
