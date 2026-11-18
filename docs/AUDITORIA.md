# Auditoria — registro e plano

## Corrigido nesta rodada
1. **Aterramento duplicado** — `lib/entrada-calc.ts`: a Entrada não lança mais haste, conector e caixa de inspeção. Esses itens vêm só da etapa Aterramento (3 hastes de 2,40 m por padrão). Teste novo: `tests/aterramento-unico.test.mjs`. Snapshot `rede-seguranca.json` atualizado: nos 20 cenários só saíram essas 3 linhas.
2. **Novo orçamento** — `app/components/orca-app.tsx` + `dialogo-confirmar.tsx`: pede confirmação antes de apagar. Texto muda conforme o caso: pago com edições restantes, pago sem edições, Pix em andamento, sem pagamento. Orçamento vazio recomeça direto.
3. **Aviso antes de gastar edição** — `app/components/step-previa.tsx`: se algo mudou desde o último PDF, pergunta «Isso usa 1 das suas N edições gratuitas. Depois restarão N-1» (última edição tem texto próprio). Sem mudança, abre direto e não gasta.
4. **Falha ao liberar o PDF** — `app/components/checkout-modal.tsx`: erro permanente (dados inválidos/incompletos) para na hora com mensagem clara; erro de conexão tenta até 5 vezes e então mostra «Tentar de novo». O pagamento fica preservado.
5. **Consulta do Pix** — mesmo arquivo: não consulta o Mercado Pago com a aba em segundo plano e confere na hora ao voltar.

## Regras do produto (confirmadas)
- Pix vale 30 min; vencido, gera-se novo QR para o mesmo orçamento.
- Pagou: PDF original + 3 edições gratuitas em 15 dias, contados do pagamento.
- Atualizar a página não perde nada; «Novo orçamento» apaga tudo e exige novo pagamento.

## Pendente (decisões ou testes seus)
- [ ] **PDF perdido depois de pagar** (limpar dados, outro aparelho, Safari/iPhone após 7 dias sem uso): hoje não há recuperação. Decidir: reforçar o aviso de «Baixar cópia» ou guardar/enviar o PDF por e-mail.
- [ ] Conferir **63 A com cabo de 10 mm²** (monofásico 220 V, categoria M3) na DIS-NOR-030 / NBR 5410.
- [ ] Testar o **«Salvar como PDF» no Chrome do celular** e o botão «Avançar» na etapa Cômodos (parecia encostar na borda).
- [ ] Testar um Pix `TEST-...` completo no deploy de teste: pagar, atualizar a página no meio, editar, gastar as 3 edições, «Novo orçamento».
- [ ] Opcional: limite de requisições em `/api/pagar`; webhook do Mercado Pago.
- [ ] Opcional: página 5 do PDF fica quase vazia (2 linhas de circuito e depois a Lista de Materiais começa em página nova). Só estético.
