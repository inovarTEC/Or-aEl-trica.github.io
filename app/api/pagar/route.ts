import { randomUUID } from 'crypto';
import { criarPix, preco } from '@/lib/server/mercadopago';
import { EMAIL, UUID, chaveConfere, erro, hashChave, novaChave, ok } from '@/lib/server/pedido';
import { gravarJSON, lerJSON, Orcamento, Pagamento } from '@/lib/server/store';

export const runtime = 'nodejs';

/**
 * Cria um Pix.
 *  - Pedido novo:   { email, dados }            -> devolve orcamentoId + chave (segredo do cliente)
 *  - Novo QR Code:  { orcamentoId, chave }      -> mesmo orçamento, novo Pix (o anterior venceu)
 */
export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 300_000) return erro(413, 'muito_grande');
  let corpo: any;
  try { corpo = JSON.parse(texto); } catch { return erro(400, 'json_invalido'); }

  let orc: Orcamento;
  let chaveNova: string | undefined;

  if (corpo?.orcamentoId) {
    if (!UUID.test(String(corpo.orcamentoId)) || typeof corpo.chave !== 'string') return erro(400, 'dados_invalidos');
    const achado = await lerJSON<Orcamento>(`orc/${corpo.orcamentoId}`);
    if (!achado || !chaveConfere(corpo.chave, achado.chaveHash)) return erro(404, 'nao_encontrado');
    orc = achado;
  } else {
    const email = String(corpo?.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return erro(400, 'email_invalido');
    if (!corpo?.dados || !Array.isArray(corpo.dados.rooms)) return erro(400, 'dados_invalidos');
    chaveNova = novaChave();
    orc = {
      id: randomUUID(),
      chaveHash: hashChave(chaveNova),
      email,
      dados: corpo.dados,
      criadoEm: new Date().toISOString(),
    };
    await gravarJSON(`orc/${orc.id}`, orc);
  }

  try {
    const pix = await criarPix({ orcamentoId: orc.id, email: orc.email, idempotencia: randomUUID() });
    const pag: Pagamento = { id: pix.id, orcamentoId: orc.id, criadoEm: new Date().toISOString() };
    await gravarJSON(`pag/${pix.id}`, pag);
    return ok({
      orcamentoId: orc.id,
      ...(chaveNova ? { chave: chaveNova } : {}),
      pagamentoId: pix.id,
      qrCode: pix.qrCode,
      qrBase64: pix.qrBase64,
      expira: pix.expira,
      valor: preco(),
    });
  } catch {
    return erro(502, 'mp_indisponivel');
  }
}
