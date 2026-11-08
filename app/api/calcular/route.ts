import { calcTotais, calcPendencias } from '@/lib/server/calculator';
import { calcularMateriais } from '@/lib/server/calc-materiais';
import { ok } from '@/lib/server/pedido';
import { preco } from '@/lib/server/mercadopago';
import { ErroApi, exigirDados, lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Prévia gratuita: só totais, pendências e contagens. Circuitos e materiais ficam no PDF pago. */
export const POST = rota('calcular', async (req) => {
  const corpo = await lerCorpo(req);
  // Estrutura e números são validados; completude não (as pendências aparecem na prévia).
  const dados = exigirDados(corpo?.dados, false) as any;
  let resultado;
  try {
    resultado = calcularMateriais(dados);
  } catch (e) {
    throw new ErroApi(422, 'calculo_falhou', e);
  }
  return ok({
    valor: preco(),
    totais: calcTotais(dados),
    pendencias: calcPendencias(dados),
    resumo: {
      nCircuitos: resultado.circuitos.length,
      nMateriais: resultado.materiais.length,
    },
    // Padrão de entrada (DIS-NOR-030): demanda, categoria, disjuntor geral e tensão da localidade.
    entrada: {
      demandaKva: resultado.quadro.demandaKva,
      categoria: resultado.quadro.categoria,
      disjuntorGeralA: resultado.quadro.disjuntorGeralA,
      sistema: resultado.quadro.sistema,
      uf: resultado.quadro.uf ?? null,
    },
  });
});
