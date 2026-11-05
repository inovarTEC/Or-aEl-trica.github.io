/* Regras da edição gratuita de um orçamento já pago. Roda só no servidor. */
import { createHash } from 'crypto';
import { erro } from './pedido';
import { normalizarCodigo } from './codigo';
import { Acesso, Orcamento, acessoPorCodigo, apagarAcesso, edicoesUsadas, gravarJSON, lerJSON } from './store';

export const PRAZO_DIAS = 15;      // edição gratuita vale por 15 dias, contados da entrega do primeiro PDF
export const EDICOES_MAX = 3;      // no máximo 3 edições gratuitas
export const RETENCAO_DIAS = 15;   // depois do prazo, os dados ainda ficam guardados por mais 15 dias
const DIA = 86_400_000;

export function novoAcesso(orc: Orcamento, pagamentoId: string, codigo: string): Acesso {
  const agora = Date.now();
  return {
    pagamentoId,
    orcamentoId: orc.id,
    codigo,
    entregueEm: new Date(agora).toISOString(),
    expiraEm: new Date(agora + PRAZO_DIAS * DIA).toISOString(),
    removerApos: new Date(agora + (PRAZO_DIAS + RETENCAO_DIAS) * DIA).toISOString(),
  };
}

/* ---------- limite de tentativas erradas por endereço (contagem aproximada) ---------- */
const JANELA_MS = 15 * 60_000;
const MAX_FALHAS = 10;

function ipDe(req: Request): string | null {
  return req.headers.get('x-nf-client-connection-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}
const chaveLimite = (ip: string) => `tent/${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;

async function bloqueado(req: Request): Promise<boolean> {
  const ip = ipDe(req);
  if (!ip) return false;
  const r = await lerJSON<{ n: number; desde: number }>(chaveLimite(ip));
  return !!r && Date.now() - r.desde < JANELA_MS && r.n >= MAX_FALHAS;
}

async function registrarFalha(req: Request): Promise<void> {
  const ip = ipDe(req);
  if (!ip) return;
  const k = chaveLimite(ip);
  const r = await lerJSON<{ n: number; desde: number }>(k);
  const vigente = r && Date.now() - r.desde < JANELA_MS;
  await gravarJSON(k, vigente ? { n: r.n + 1, desde: r.desde } : { n: 1, desde: Date.now() });
}

export type EstadoAcesso = 'ativo' | 'sem_edicoes' | 'expirado';

export interface AcessoCarregado {
  acesso: Acesso;
  orc: Orcamento;
  estado: EstadoAcesso;
  restantes: number;
}

const mesmoEmail = (a: string, b: string) =>
  createHash('sha256').update(a.trim().toLowerCase()).digest('hex') ===
  createHash('sha256').update(b.trim().toLowerCase()).digest('hex');

/** Confere código + e-mail. Qualquer erro devolve a mesma resposta, para não revelar o que existe. */
export async function carregarAcesso(
  req: Request,
  codigoBruto: string,
  email: string,
): Promise<AcessoCarregado | { falha: Response }> {
  if (await bloqueado(req)) return { falha: erro(429, 'muitas_tentativas') };

  const negar = async () => {
    await registrarFalha(req);
    return { falha: erro(404, 'nao_encontrado') };
  };

  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo || typeof email !== 'string' || !email.trim()) return negar();

  const acesso = await acessoPorCodigo(codigo);
  if (!acesso) return negar();

  const orc = await lerJSON<Orcamento>(`orc/${acesso.orcamentoId}`);
  if (!orc || !mesmoEmail(orc.email, email)) return negar();

  if (Date.now() > Date.parse(acesso.removerApos)) {
    await apagarAcesso(acesso);
    return { falha: erro(404, 'nao_encontrado') };
  }

  const usadas = await edicoesUsadas(acesso.pagamentoId);
  const restantes = Math.max(0, EDICOES_MAX - usadas);
  const estado: EstadoAcesso =
    Date.now() > Date.parse(acesso.expiraEm) ? 'expirado' : restantes === 0 ? 'sem_edicoes' : 'ativo';
  return { acesso, orc, estado, restantes };
}
