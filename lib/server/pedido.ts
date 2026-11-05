/* Regras compartilhadas pelas rotas: valida dono do orçamento e confere o pagamento no Mercado Pago. */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { buscarPagamento, preco, PagamentoMP } from './mercadopago';
import { logErro } from './log';
import { lerJSON, Orcamento, Pagamento } from './store-blobs';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_MP = /^\d{3,20}$/;
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export const hashChave = (c: string) => createHash('sha256').update(c).digest('hex');
export const novaChave = () => randomBytes(24).toString('hex');

export function erro(status: number, codigo: string) {
  return NextResponse.json({ erro: codigo }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function ok(corpo: unknown) {
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
}

export function chaveConfere(chave: string, hashGuardado: string): boolean {
  const a = Buffer.from(hashChave(chave), 'hex');
  const b = Buffer.from(hashGuardado, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Situacao = 'aprovado' | 'pendente' | 'vencido' | 'recusado';

export function situacao(mp: PagamentoMP, orcamentoId: string): Situacao {
  if (mp.status === 'approved') {
    // Só vale se for este orçamento e o valor cobrado.
    if (mp.referencia !== orcamentoId || Math.abs(mp.valor - preco()) > 0.001) {
      logErro('pedido', 'pagamento aprovado não confere', mp.id);
      return 'recusado';
    }
    return 'aprovado';
  }
  if (mp.status === 'pending' || mp.status === 'in_process' || mp.status === 'authorized') {
    const exp = Date.parse(mp.expira);
    return Number.isFinite(exp) && Date.now() > exp + 5000 ? 'vencido' : 'pendente';
  }
  if (mp.status === 'cancelled' && /expired/i.test(mp.statusDetail)) return 'vencido';
  return 'recusado';
}

/** Carrega orçamento e pagamento, confere a chave secreta e consulta o status real no Mercado Pago. */
export async function conferir(
  orcamentoId: string,
  pagamentoId: string,
  chave: string,
): Promise<{ orc: Orcamento; pag: Pagamento; mp: PagamentoMP; estado: Situacao } | { falha: Response }> {
  if (!UUID.test(orcamentoId) || !ID_MP.test(pagamentoId) || !chave) return { falha: erro(400, 'dados_invalidos') };
  const orc = await lerJSON<Orcamento>(`orc/${orcamentoId}`);
  if (!orc || !chaveConfere(chave, orc.chaveHash)) return { falha: erro(404, 'nao_encontrado') };
  const pag = await lerJSON<Pagamento>(`pag/${pagamentoId}`);
  if (!pag || pag.orcamentoId !== orcamentoId) return { falha: erro(404, 'nao_encontrado') };
  try {
    const mp = await buscarPagamento(pagamentoId);
    return { orc, pag, mp, estado: situacao(mp, orcamentoId) };
  } catch {
    return { falha: erro(502, 'mp_indisponivel') };
  }
}
