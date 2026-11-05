/* Código do orçamento: 12 caracteres sem letras e números confusos (sem I, L, O, 0 e 1). */
import { randomInt } from 'crypto';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 12;

export function gerarCodigo(): string {
  let c = '';
  for (let i = 0; i < TAMANHO_CODIGO; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

/** Mostra em grupos de 4: K7M2-9PQX-4TRH */
export function formatarCodigo(c: string): string {
  return c.match(/.{1,4}/g)?.join('-') ?? c;
}

/** Aceita minúsculas, espaços e hífens. Devolve null se não for um código válido. */
export function normalizarCodigo(entrada: string): string | null {
  const c = String(entrada ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== TAMANHO_CODIGO) return null;
  for (const ch of c) if (!ALFABETO.includes(ch)) return null;
  return c;
}
