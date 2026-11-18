# Auditoria — registro e plano

## Corrigido nesta rodada
1. **Aterramento duplicado** — `lib/entrada-calc.ts`: a Entrada não lança mais haste, conector e caixa de inspeção. Esses itens vêm só da etapa Aterramento (3 hastes de 2,40 m por padrão). Teste novo: `tests/aterramento-unico.test.mjs`. Snapshot `rede-seguranca.json` atualizado: nos 20 cenários só saíram essas 3 linhas.
2. **Novo orçamento** — `app/components/orca-app.tsx` + `dialogo-confirmar.tsx`: pede confirmação antes de apagar. Texto muda conforme o caso: pago com edições restantes, pago sem edições, Pix em andamento, sem pagamento. Orçamento vazio recomeça direto.
3. **Aviso antes de gastar edição** — `app/components/step-previa.tsx`: se algo mudou desde o último PDF, pergunta «Isso usa 1 das suas N edições gratuitas. Depois restarão N-1» (última edição tem texto próprio). Sem mudança, abre direto e não gasta.
4. **Falha ao liberar o PDF** — `app/components/checkout-modal.tsx`: erro permanente (dados inválidos/incompletos) para na hora com mensagem clara; erro de conexão tenta até 5 vezes e então mostra «Tentar de novo». O pagamento fica preservado.
5. **Consulta do Pix** — mesmo arquivo: não consulta o Mercado Pago com a aba em segundo plano e confere na hora ao voltar.

## Tema claro e escuro (rodada seguinte)
- **Onde ficam as cores:** `app/globals.css`, blocos `:root` (claro) e `.dark` (escuro). Para mudar um tom, edite só ali. Tokens novos: `--primary-text` (texto/ícone em amarelo, mais escuro no claro), `--selected` (opção escolhida), `--header`.
- **Claro:** grafite + amarelo elétrico (fundo `#F3F2EE`, cartões brancos, cabeçalho `#1F2937`, botões `#FBBF24`). **Escuro:** grafite escuro + amarelo (fundo `#0F1318`, cartões `#1A2028`).
- **Chave de tema:** ícone de lua/sol no cabeçalho. A escolha fica salva no navegador (padrão: claro).
- **Botões:** Voltar, Avançar e Novo orçamento no mesmo amarelo. Voltar e Avançar com o mesmo tamanho (`h-11 w-36`). Novo orçamento um pouco maior. Posição de Voltar/Avançar inalterada (fim da página, sem barra fixa).
- **Amarelo suave** (variante `soft` do botão, tokens `--soft*`): botões de adicionar — «Adicionar cômodo», «+ Tomada», «+ Luz», «+ Interruptor», «Adicionar equipamento». O «+ Cômodo» tracejado da etapa Pontos manteve o estilo atual.
- **Avisos no tema escuro:** as caixas amarelas, verdes, azuis e vermelhas têm versão escura no fim do `globals.css`.
- **Não mudou:** PDF (visual próprio), textos, cálculos, circuitos, pagamento. O QR Code do Pix continua em fundo branco (necessário para leitura).
- **Verde mantido** onde significa sucesso/PDF (cartão «Gerar meu PDF», pagamento confirmado).

## Regras do produto (confirmadas)
- Pix vale 30 min; vencido, gera-se novo QR para o mesmo orçamento.
- Pagou: PDF original + 3 edições gratuitas em 15 dias, contados do pagamento.
- Atualizar a página não perde nada; «Novo orçamento» apaga tudo e exige novo pagamento.

## Pendente (decisões ou testes seus)
- [ ] **PDF perdido depois de pagar** (limpar dados, outro aparelho, Safari/iPhone após 7 dias sem uso): hoje não há recuperação. Decidir: reforçar o aviso de «Baixar cópia» ou guardar/enviar o PDF por e-mail.
- [ ] Conferir **63 A com cabo de 10 mm²** (monofásico 220 V, categoria M3) na DIS-NOR-030 / NBR 5410.
- [ ] Olhar **as 7 etapas nos dois temas** no celular (principalmente Equipamentos, Entrada e Prévia, com mais avisos coloridos) e o cabeçalho em tela bem estreita (320 a 360 px).
- [ ] Testar o **«Salvar como PDF» no Chrome do celular** e o botão «Avançar» na etapa Cômodos (parecia encostar na borda).
- [ ] Testar um Pix `TEST-...` completo no deploy de teste: pagar, atualizar a página no meio, editar, gastar as 3 edições, «Novo orçamento».
- [ ] Opcional: limite de requisições em `/api/pagar`; webhook do Mercado Pago.
- [ ] Opcional: página 5 do PDF fica quase vazia (2 linhas de circuito e depois a Lista de Materiais começa em página nova). Só estético.
