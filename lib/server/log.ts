/* Logger do servidor: uma linha JSON por evento (fácil de filtrar no painel do Netlify), sem e-mails. */
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

function serializar(v: unknown): unknown {
  if (v instanceof Error) return { nome: v.name, msg: v.message, stack: v.stack?.split('\n').slice(0, 6).join('\n') };
  return v;
}

export function logErro(contexto: string, mensagem: string, ...detalhes: unknown[]): void {
  let linha: string;
  try {
    linha = JSON.stringify({ nivel: 'erro', contexto, mensagem, detalhes: detalhes.map(serializar), em: new Date().toISOString() });
  } catch {
    linha = JSON.stringify({ nivel: 'erro', contexto, mensagem });
  }
  // Único ponto do app que escreve no console: é por ele que o Netlify Functions coleta os logs.
  console.error(linha.replace(EMAIL, '[email]'));
}
