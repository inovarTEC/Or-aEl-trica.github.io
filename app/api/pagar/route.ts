import { randomUUID } from 'crypto';
import { criarPix, preco } from '@/lib/server/mercadopago';
import { EMAIL, UUID, chaveConfere, erro, hashChave, novaChave, ok } from '@/lib/server/pedido';
import { gravarJSON, lerJSON, Orcamento, Pagamento } from '@/lib/server/store-blobs';
import { exigirDados, lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/**
 * Cria um Pix.
 *  - Pedido novo:   { email, dados }            -> devolve orcamentoId + chave (segredo do cliente)
 *  - Novo QR Code:  { orcamentoId, chave }      -> mesmo pedido, novo Pix (o anterior venceu)
 * Os dados só são validados (não cobra por orçamento incompleto); NÃO são gravados no servidor.
 */
export const POST = rota('pagar', async (req) => {
  const corpo = await lerCorpo(req);

  let orc: Orcamento;
  let chaveNova: string | undefined;

  if (corpo?.orcamentoId) {
    if (!UUID.test(String(corpo.orcamentoId)) || typeof corpo.chave !== 'string') return erro(400, 'dados_invalidos');
    const achado = await lerJSON<Orcamento>(`orc/${corpo.orcamentoId}`);
    if (!achado || !chaveConfere(corpo.chave, achado.chaveHash)) return erro(404, 'nao_encontrado');
    orc = { ...achado, orcamentoId: String(corpo.orcamentoId) };
  } else {
    const email = String(corpo?.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return erro(400, 'email_invalido');
    // Não cobra por orçamento vazio/incompleto: mesmas regras que bloqueiam o wizard.
    exigirDados(corpo?.dados, true);
    chaveNova = novaChave();
    orc = {
      orcamentoId: randomUUID(),
      email,
      chaveHash: hashChave(chaveNova),
      criadoEm: new Date().toISOString(),
    };
    await gravarJSON(`orc/${orc.orcamentoId}`, orc);
  }

  try {
    const pix = await criarPix({ orcamentoId: orc.orcamentoId, email: orc.email, idempotencia: randomUUID() });
    const pag: Pagamento = { id: pix.id, orcamentoId: orc.orcamentoId, criadoEm: new Date().toISOString() };
    await gravarJSON(`pag/${pix.id}`, pag);
    return ok({
      orcamentoId: orc.orcamentoId,
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
});
