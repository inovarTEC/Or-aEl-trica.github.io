/* Middleware compartilhado das rotas de API: leitura do corpo + tratamento de erros num só lugar. */
import { erro } from './pedido';
import { logErro } from './log';
import type { DadosOrcamento } from '../types';
import { faltasObrigatorias, problemaEstrutura, somenteDados } from '../validacao';
import { limparOrfaos } from '../limpeza';

/** Erro "esperado": vira a resposta { erro: codigo } com o status indicado. */
export class ErroApi extends Error {
  constructor(public status: number, public codigo: string, public causa?: unknown) {
    super(codigo);
  }
}

type Handler = (req: Request) => Promise<Response>;

/** Envolve o handler: ErroApi vira resposta controlada; qualquer outra exceção é logada e vira 500. */
export function rota(nome: string, fn: Handler): Handler {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ErroApi) {
        if (e.causa !== undefined || e.status >= 500) logErro(nome, e.codigo, e.causa);
        return erro(e.status, e.codigo);
      }
      logErro(nome, 'erro_inesperado', e);
      return erro(500, 'erro_interno');
    }
  };
}

/**
 * Valida os dados do orçamento vindos do cliente e devolve só os campos do cálculo.
 * `completo` = exige também os campos obrigatórios do wizard (usado antes de cobrar ou gerar o PDF).
 */
export function exigirDados(d: unknown, completo: boolean): DadosOrcamento {
  const problema = problemaEstrutura(d);
  if (problema) throw new ErroApi(400, 'dados_invalidos');
  // Rede de segurança: sem ponto vazio, interruptor sem função nem referência a cômodo removido no cálculo.
  const dados = limparOrfaos(somenteDados(d));
  if (completo && faltasObrigatorias(dados).length > 0) throw new ErroApi(422, 'dados_incompletos');
  return dados;
}

/** Lê o JSON do corpo com limite de tamanho. */
export async function lerCorpo(req: Request, limite = 300_000): Promise<any> {
  const texto = await req.text();
  if (texto.length > limite) throw new ErroApi(413, 'muito_grande');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroApi(400, 'json_invalido');
  }
}
