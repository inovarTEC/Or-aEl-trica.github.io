# OrçaElétrica — Documentação

Versão publicada: https://orcaeletrica.netlify.app · Código: `main` (merge do PR #13, novembro/2026)

## 1. O que é

O OrçaElétrica monta, passo a passo, o orçamento de material para uma instalação elétrica residencial. A prévia na tela é gratuita. O orçamento técnico completo em PDF é liberado depois de um pagamento via Pix pelo Mercado Pago. O preço padrão é R$ 5,90 e pode ser alterado na variável `PRECO`.

O cálculo segue as regras da NBR 5410: quantidade mínima de tomadas, separação de circuitos, bitola, disjuntor, eletroduto e cores dos cabos.

## 2. Como o usuário usa (7 passos)

| Passo | O que informa | O que o app faz |
|---|---|---|
| 1. Imóvel | Tipo de imóvel, obra, cobertura e ligação (mono, bi ou trifásica) | Define a tensão e as regras gerais |
| 2. Cômodos | Nome, medidas, distância até o quadro, tipo de instalação (embutida, aparente ou pela laje), pé-direito | Calcula área, perímetro e trajeto. No cômodo aparente, o usuário escolhe canaleta (peças de 2 m), eletroduto rígido em metros ou eletroduto rígido em peças de 3 m |
| 3. Pontos | Tomadas (simples, dupla, tripla, 10A, 20A, USB), luzes e interruptores (simples, paralelo, intermediário) | Liga cada luz ao seu interruptor, sugere caixa 4x2 ou 4x4 e mostra o resumo do cômodo |
| 4. Equipamentos | Chuveiro, ar-condicionado, forno etc.: potência, tensão, cômodo e tipo de ponto | Calcula a corrente e sugere ligação direta (borne ou Wago) acima de 16 A |
| 5. Entrada | Tipo (aérea, subterrânea ou pela parede), poste, percurso, demanda, eletroduto em metros ou em barras de 3 m | Sugere o sistema, a bitola, o disjuntor geral e o diâmetro do eletroduto, e gera os materiais da entrada |
| 6. Aterramento | Número de hastes, caixas de inspeção, bitola e distância | Gera os materiais do aterramento e avisos |
| 7. Prévia | — | Mostra resumo, pendências clicáveis, links de afiliados, busca de eletricista por CEP e o botão de pagamento |

Os dados ficam salvos no próprio navegador (localStorage), sem cadastro.

## 3. Pagamento e PDF

1. Na prévia, o usuário clica em pagar e informa o e-mail.
2. O app chama `/api/pagar`, que gera o Pix no Mercado Pago e mostra o QR Code com uma mensagem de segurança.
3. O app consulta `/api/verificar` até o pagamento ser aprovado.
4. `/api/liberar` confere o pagamento e a chave do pedido, calcula os materiais no servidor e devolve o PDF.
5. `/api/regerar` permite baixar de novo o mesmo orçamento já pago. Se o orçamento for alterado depois do pagamento, ele não é liberado de novo.

**O que o PDF traz:** dados do cliente, imóvel, especificações por cômodo, equipamentos, entrada/alimentador, aterramento, resumo de cargas, quadro e circuitos (bitola, disjuntor, DR/DPS), lista de materiais com quantidades, pendências, links de afiliados, busca de eletricista e observações. O rodapé mostra "Página X de Y".

## 4. Regras de material (principais)

- **Embutida ou pela laje:** eletroduto flexível corrugado em metros (+10%), caixa de embutir 4x2/4x4, caixa redonda de fundo e placas.
- **Aparente com canaleta:** barras de 2 m, emendas, curvas, bucha e parafuso.
- **Aparente com eletroduto rígido:** em metros ou em barras de 3 m, com luvas, curvas 90°, abraçadeiras, bucha e parafuso.
- **Caixas e acessórios no cômodo aparente:** condulete 4x2/4x4, caixa octogonal de sobrepor para luz, tampas, tomadas e interruptores de sobrepor.
- **Cabos:** fase preto, neutro azul e terra verde-amarelo. Circuito 220 V entre fases (bi ou trifásico): preto + vermelho + terra, sem neutro.
- **Entrada subterrânea:** eletroduto em metros ou em barras de 3 m (com luvas e 2 curvas). Poste de 6 ou 7 m: tubo de 3 m, curvas de 90° e 180°, 4 luvas de rosca e abraçadeira.
- **Disjuntor geral:** se a entrada foi informada, sai uma vez só, pela entrada.

## 5. Arquitetura técnica

| Camada | Tecnologia / arquivos |
|---|---|
| Front-end | Next.js 16 (App Router), React 19, TypeScript, Tailwind + shadcn/ui |
| Estado | zustand (`lib/store-cliente.ts`), salvo em `localStorage` (`lib/storage-local.ts`, chave `orca_v2`) |
| Passos | `app/components/step-*.tsx`, orquestrados por `orca-app.tsx` e `progress-bar.tsx` |
| Cálculo da prévia | `lib/server/calculator.ts` via `/api/calcular` |
| Cálculo do PDF | `lib/server/calc-materiais.ts`, `lib/server/nbr5410.ts`, `lib/entrada-calc.ts`, `lib/aterramento-calc.ts` |
| PDF | `lib/server/pdf-template.ts` (HTML impresso em A4) |
| Pagamento | `lib/server/mercadopago.ts`, `lib/server/pedido.ts`, `app/api/pagar`, `verificar`, `liberar`, `regerar` |
| Armazenamento do pedido | Netlify Blobs (`lib/server/store-blobs.ts`) |
| Validação | `lib/validacao.ts` (valida no cliente e no servidor) |
| Hospedagem | Netlify (`netlify.toml`), publica sozinho a cada merge no `main` |

**Testes:** `tests/*.test.mjs`, 8 arquivos. Para rodar: `npx tsc --noEmit` e `node tests/<arquivo>.test.mjs`.

**Variáveis de ambiente:** token do Mercado Pago, `PRECO` e as configurações do Netlify Blobs. Veja `lib/server/mercadopago.ts`.

## 6. Limitações atuais

- O orçamento fica salvo só no navegador: se o usuário trocar de aparelho ou limpar os dados, perde o orçamento.
- Não existe conta de usuário nem histórico de orçamentos.
- Não é possível editar o orçamento depois de pago.
- A lista de materiais não traz preços. É só material e quantidade.
- Os pontos de equipamento não entram na contagem de caixas.
- O app precisa de internet para calcular e pagar.

## 7. Melhorias futuras

Veja o PDF **OrcaEletrica_Melhorias.pdf**, também disponível em `docs/MELHORIAS.md`.
