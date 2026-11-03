# OrçaElétrica — Netlify + Mercado Pago (Pix)

## Como funciona
- A página só coleta os dados. **Todo o cálculo (NBR 5410) roda no servidor** (`lib/server/`), nunca no navegador.
- `/api/calcular` → prévia gratuita (totais e pendências, sem circuitos/materiais).
- `/api/pagar` → cria o Pix no Mercado Pago (também gera novo QR Code se o anterior vencer).
- `/api/verificar` → consulta o status real no Mercado Pago.
- `/api/liberar` → só entrega o PDF se o Mercado Pago confirmar **aprovado**, com o valor e o pedido corretos, e **uma única vez por pagamento**.
- Dados ficam no Netlify Blobs (sem banco externo).

## Variáveis de ambiente (Netlify > Site configuration > Environment variables)
| Nome | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | credencial **secreta** do Mercado Pago (`TEST-...` para testar, `APP_USR-...` em produção) |
| `PRECO` | valor do PDF, ex.: `5.90` |
| `PIX_EXPIRA_MIN` | validade do QR em minutos (mínimo 30) |

Pix não usa a chave pública. Nunca coloque o token no código nem no GitHub.

## Publicar
1. Repositório **privado** no GitHub e suba estes arquivos (sem `node_modules`/`.next`, o `.gitignore` já cuida disso).
2. Netlify > Add new site > Import from GitHub. Build: `npm run build` (já está no `netlify.toml`).
3. Cadastre as variáveis acima e faça um novo deploy.

## Testes antes de lançar
- Pix aprovado libera o PDF; o mesmo pagamento não libera de novo.
- Pix vencido mostra “Gerar novo QR Code” e o orçamento continua.
- Sem pagamento aprovado o PDF não sai.
- “Exibir código-fonte” e aba Rede: a fórmula não aparece (já verificado no build).
- No e-mail do pagador, use um e-mail diferente do da sua conta de vendedor (o Mercado Pago recusa o mesmo).
- Para o teste com dinheiro real, coloque `PRECO=1.00`.

## Observações
- O PDF é gerado pelo navegador (“Salvar como PDF” na janela de impressão) a partir do HTML liberado pelo servidor.
- Se um cliente pagar e não conseguir salvar, apague a chave `entrega/<id do pagamento>` no painel do Netlify Blobs para liberar de novo.
- Não incluído (opcional depois): webhook de reforço, envio por e-mail, login.
