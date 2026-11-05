import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { conferir, erro, ok } from '@/lib/server/pedido';
import { travarEntrega } from '@/lib/server/store-blobs';
import { ErroApi, exigirDados, lerCorpo, rota } from '@/lib/server/rota';
import type { AppState } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Entrega o PDF original UMA vez por pagamento aprovado.
 * Corpo: { orcamentoId, pagamentoId, dados } + header x-chave. Os dados vêm do navegador do cliente.
 * Resposta: { html }. O navegador guarda o HTML e conta as edições gratuitas (lib/storage-local.ts).
 */
export const POST = rota('liberar', async (req) => {
  const corpo = await lerCorpo(req);
  const r = await conferir(
    String(corpo?.orcamentoId ?? ''),
    String(corpo?.pagamentoId ?? ''),
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  if (r.estado !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');

  const dados = exigirDados(corpo?.dados, true) as AppState;
  let html: string;
  try {
    html = gerarHtmlPdf(dados);
  } catch (e) {
    throw new ErroApi(500, 'geracao_falhou', e);
  }

  // Trava só depois de gerar: se a geração falhar, o cliente pode tentar de novo.
  if (!(await travarEntrega(r.mp.id))) return erro(409, 'ja_entregue');
  return ok({ html });
});
