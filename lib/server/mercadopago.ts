/* Mercado Pago — somente Pix. Roda apenas no servidor. */
import { logErro } from './log';

const API = 'https://api.mercadopago.com';

export function preco(): number {
  const n = Number(process.env.PRECO ?? '5.90');
  return Number.isFinite(n) && n >= 0.01 ? Math.round(n * 100) / 100 : 5.9;
}

function accessToken(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error('MP_ACCESS_TOKEN não configurada');
  return t;
}

/** Data no formato que o Mercado Pago exige: ISO com fuso (-03:00). */
function isoBrasilia(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().replace('Z', '-03:00');
}

export interface PixCriado {
  id: string;
  status: string;
  qrCode: string;
  qrBase64: string;
  expira: string;
}

export async function criarPix(opts: { orcamentoId: string; email: string; idempotencia: string }): Promise<PixCriado> {
  const minutos = Math.max(30, Number(process.env.PIX_EXPIRA_MIN ?? '30') || 30);
  const res = await fetch(`${API}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': opts.idempotencia,
    },
    body: JSON.stringify({
      transaction_amount: preco(),
      description: 'OrçaElétrica — PDF do orçamento',
      payment_method_id: 'pix',
      external_reference: opts.orcamentoId,
      date_of_expiration: isoBrasilia(new Date(Date.now() + minutos * 60_000)),
      payer: { email: opts.email },
    }),
    cache: 'no-store',
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    logErro('mp', 'erro ao criar Pix', res.status, JSON.stringify(data).slice(0, 500));
    throw new Error('mp_criar_falhou');
  }
  const td = data?.point_of_interaction?.transaction_data;
  if (!data?.id || !td?.qr_code) {
    logErro('mp', 'resposta sem QR', JSON.stringify(data).slice(0, 500));
    throw new Error('mp_sem_qr');
  }
  return {
    id: String(data.id),
    status: String(data.status),
    qrCode: String(td.qr_code),
    qrBase64: String(td.qr_code_base64 ?? ''),
    expira: String(data.date_of_expiration ?? ''),
  };
}

export interface PagamentoMP {
  id: string;
  status: string;
  statusDetail: string;
  valor: number;
  referencia: string;
  expira: string;
}

export async function buscarPagamento(id: string): Promise<PagamentoMP> {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    cache: 'no-store',
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    logErro('mp', 'erro ao consultar', res.status, JSON.stringify(data).slice(0, 300));
    throw new Error('mp_consulta_falhou');
  }
  return {
    id: String(data.id),
    status: String(data.status),
    statusDetail: String(data.status_detail ?? ''),
    valor: Number(data.transaction_amount),
    referencia: String(data.external_reference ?? ''),
    expira: String(data.date_of_expiration ?? ''),
  };
}
