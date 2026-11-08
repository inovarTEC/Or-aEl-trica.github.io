# OrçaElétrica — Melhorias futuras

## 1. Área do Profissional (prioridade principal)

**Objetivo:** o eletricista monta o orçamento do serviço a partir da lista de material, coloca preço e mão de obra, e entrega ao cliente um orçamento com a marca dele.

**Funções:**

1. **Cadastro do profissional:** nome, CPF/CNPJ, telefone, logo, assinatura, cidade.
2. **Clientes:** cadastro com nome, endereço e telefone, e histórico de orçamentos por cliente.
3. **Orçamento a partir da lista de material:**
    - o profissional marca quais itens vai executar ou fornecer;
    - coloca o preço unitário de cada material, ou usa uma tabela de preços própria salva no app;
    - escolhe se o material fica por conta do cliente ou do profissional.
4. **Mão de obra:** preço por ponto (tomada, luz, interruptor), por circuito, por metro, por serviço (quadro, entrada, aterramento) ou valor fechado.
5. **Fechamento:** desconto, taxa de deslocamento, prazo de execução, validade da proposta, forma de pagamento e garantia.
6. **Orçamento profissional em PDF:** com logo e dados do profissional, separação entre material e mão de obra, total, condições e campo de assinatura.
7. **Envio ao cliente:** WhatsApp, e-mail e link para o cliente ver e aprovar o orçamento.
8. **Situação do orçamento:** rascunho, enviado, aprovado, recusado, executado.
9. **Duplicar orçamento:** usar um orçamento antigo como modelo.

## 2. Funcionamento offline

- Transformar o app em **PWA** (instalável no celular, com ícone na tela inicial).
- Montar o orçamento e calcular sem internet. Para isso, o cálculo tem que rodar também no aparelho.
- Guardar os orçamentos no aparelho (IndexedDB) e sincronizar com a nuvem quando a internet voltar.
- Pagamento e envio ao cliente ficam na fila e saem quando houver internet. O Pix sempre precisa de conexão.
- Dados do plano guardados no aparelho, com uma conferência online de tempos em tempos (por exemplo, a cada 7 dias).

## 3. Planos de acesso (profissional)

| Plano | Como funciona |
|---|---|
| Avulso | Paga por orçamento (como hoje) |
| Mensal | Orçamentos ilimitados durante o mês |
| Anual | Orçamentos ilimitados durante o ano, com desconto |
| Vitalício | Pagamento único, acesso para sempre |

**O que é preciso para isso:**

- **Login:** e-mail com código ou Google, para o plano valer em qualquer aparelho.
- **Banco de dados:** profissionais, clientes, orçamentos e assinaturas (por exemplo Supabase, que já está previsto).
- **Cobrança:** assinatura recorrente no Mercado Pago (mensal e anual) e Pix para o avulso e o vitalício.
- **Controle de acesso:** bloqueio automático quando o plano vence e avisos antes de vencer.
- **Período de teste grátis:** opcional, por exemplo 7 dias.

## 4. Ferramentas para eletricista

- Calculadora de **queda de tensão**.
- **Bitola de cabo × corrente** (NBR 5410), com fator de agrupamento e de temperatura.
- **Lei de Ohm e potência:** V, I, R, P.
- **Dimensionamento de disjuntor, DR e DPS.**
- **Ocupação de eletroduto:** quantos cabos cabem.
- **Conversões:** kW/CV/HP, BTU para W, mm² para AWG.
- **Consumo de energia:** kWh e custo mensal por aparelho.
- **Iluminação:** lux recomendado por cômodo.
- **Diagramas de ligação:** interruptor paralelo e intermediário, chuveiro, DR, minuterias.
- **Checklist de vistoria e entrega da obra.**

## 5. Melhorias no app atual

- **Preço estimado dos materiais:** tabela de referência por região ou links de compra com preço.
- **Contagem de caixas dos pontos de equipamento:** hoje não entra na contagem.
- **Editar o orçamento depois de pago:** liberar uma nova versão sem pagar de novo dentro de um prazo.
- **Salvar orçamentos na nuvem:** não perder ao trocar de aparelho.
- **Planilha (Excel/CSV) da lista de material.**
- **Diagrama unifilar simples do quadro no PDF.**
- **Testes automáticos de tela e acompanhamento de erros** (por exemplo Sentry).

## 6. Ordem sugerida

1. Login e banco de dados, que são a base para planos e para a área do profissional.
2. Área do Profissional: preços, mão de obra, PDF com a marca do profissional e envio ao cliente.
3. Planos mensal, anual e vitalício.
4. PWA e uso offline.
5. Ferramentas para eletricista.
6. Demais melhorias do app atual.
