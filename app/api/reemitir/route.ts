import { EDICOES_MAX, carregarAcesso } from '@/lib/server/acesso';
import { formatarCodigo } from '@/lib/server/codigo';
import { buscarPagamento } from '@/lib/server/mercadopago';
import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { erro, ok, situacao } from '@/lib/server/pedido';
import { gravarJSON, usarEdicao } from '@/lib/server/store';

export const runtime = 'nodejs';

/** Gera o PDF atualizado de um orçamento já pago, sem cobrar, dentro do prazo e do limite de edições. */
export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 300_000) return erro(413, 'muito_grande');
  let corpo: any;
  try { corpo = JSON.parse(texto); } catch { return erro(400, 'json_invalido'); }
  if (!corpo?.dados || !Array.isArray(corpo.dados.rooms)) return erro(400, 'dados_invalidos');

  const r = await carregarAcesso(req, String(corpo?.codigo ?? ''), String(corpo?.email ?? ''));
  if ('falha' in r) return r.falha;
  if (r.estado === 'expirado') return erro(410, 'prazo_encerrado');
  if (r.estado === 'sem_edicoes') return erro(410, 'edicoes_esgotadas');

  // O pagamento original continua precisando estar aprovado (por exemplo, não foi devolvido).
  try {
    const mp = await buscarPagamento(r.acesso.pagamentoId);
    if (situacao(mp, r.orc.id) !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');
  } catch {
    return erro(502, 'mp_indisponivel');
  }

  const proxima = EDICOES_MAX - r.restantes + 1;
  let html: string;
  try {
    html = gerarHtmlPdf(corpo.dados, { codigo: formatarCodigo(r.acesso.codigo), expiraEm: r.acesso.expiraEm, edicao: proxima });
  } catch (e) {
    console.error('[reemitir] falha ao gerar', e);
    return erro(422, 'calculo_falhou');
  }

  const numero = await usarEdicao(r.acesso.pagamentoId, EDICOES_MAX);
  if (numero === null) return erro(410, 'edicoes_esgotadas');

  await gravarJSON(`orc/${r.orc.id}`, { ...r.orc, dados: corpo.dados });
  return ok({ html, restantes: EDICOES_MAX - numero, expiraEm: r.acesso.expiraEm, edicao: numero });
}
