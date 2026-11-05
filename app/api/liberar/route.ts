import { EDICOES_MAX, novoAcesso } from '@/lib/server/acesso';
import { formatarCodigo, gerarCodigo } from '@/lib/server/codigo';
import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { conferir, erro, ok } from '@/lib/server/pedido';
import { gravarAcesso, travarEntrega } from '@/lib/server/store-blobs';
import { ErroApi, lerCorpo, rota } from '@/lib/server/rota';
import { logErro } from '@/lib/server/log';

export const runtime = 'nodejs';

/** Entrega o relatório completo UMA vez por pagamento aprovado e abre a edição gratuita (prazo e limite). */
export const POST = rota('liberar', async (req) => {
  const corpo = await lerCorpo(req, 10_000);
  const r = await conferir(
    String(corpo?.orcamentoId ?? ''),
    String(corpo?.pagamentoId ?? ''),
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  if (r.estado !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');

  const codigo = gerarCodigo();
  const acesso = novoAcesso(r.orc, r.mp.id, codigo);

  let html: string;
  try {
    html = gerarHtmlPdf(r.orc.dados as any, { codigo: formatarCodigo(codigo), expiraEm: acesso.expiraEm, edicao: 0 });
  } catch (e) {
    throw new ErroApi(500, 'geracao_falhou', e);
  }

  // Só a primeira chamada deste pagamento passa daqui.
  const primeira = await travarEntrega(r.mp.id);
  if (!primeira) return erro(409, 'ja_entregue');

  try {
    await gravarAcesso(acesso);
  } catch (e) {
    // Não bloqueia a entrega: o cliente já pagou e o PDF tem de sair.
    logErro('liberar', 'não foi possível gravar o acesso de edição', e);
  }

  return ok({ html, codigo: formatarCodigo(codigo), expiraEm: acesso.expiraEm, restantes: EDICOES_MAX });
});
