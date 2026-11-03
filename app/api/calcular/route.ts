import { calcTotais, calcPendencias } from '@/lib/server/calculator';
import { calcularMateriais } from '@/lib/server/calc-materiais';
import { erro, ok } from '@/lib/server/pedido';
import { preco } from '@/lib/server/mercadopago';

export const runtime = 'nodejs';

/** Prévia gratuita: só totais, pendências e contagens. Circuitos e materiais ficam no PDF pago. */
export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 300_000) return erro(413, 'muito_grande');
  let corpo: any;
  try { corpo = JSON.parse(texto); } catch { return erro(400, 'json_invalido'); }
  const dados = corpo?.dados;
  if (!dados || !Array.isArray(dados.rooms)) return erro(400, 'dados_invalidos');
  try {
    const resultado = calcularMateriais(dados);
    return ok({
      valor: preco(),
      totais: calcTotais(dados),
      pendencias: calcPendencias(dados),
      resumo: {
        nCircuitos: resultado.circuitos.length,
        nMateriais: resultado.materiais.length,
      },
    });
  } catch (e) {
    console.error('[calcular]', e);
    return erro(422, 'calculo_falhou');
  }
}
