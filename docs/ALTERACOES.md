# Alterações desta versão

## 1. Cômodos
- Botão **Adicionar cômodo** e a escolha de modelo ficam no **topo**.
- O cômodo novo aparece **primeiro e já aberto**; os demais ficam fechados.
- A inversão é só na tela: a ordem guardada (abas, circuitos, PDF) não muda.

## 2. Pontos
- Botão **+ Cômodo** no fim da fileira de abas: modelo, nome, comprimento e largura (as medidas são necessárias para as tomadas pela NBR 5410). A aba do cômodo novo já abre.

## 3. Equipamentos
- Botão **Adicionar equipamento** no topo; o novo entra primeiro e aberto, os outros recolhem numa linha-resumo (tipo · cômodo · potência).
- Botão **Concluir** recolhe o cartão atual. Equipamento incompleto mostra aviso na linha-resumo.
- A pendência da prévia abre o cartão certo.

## 4. Entrada de energia
- **Potência estimada (kVA)** é preenchida com a demanda do «Padrão de entrada» e continua editável.
  Editou → o app para de sobrescrever (flag `potenciaManual`). Apagou o campo e saiu dele, ou clicou em «Voltar ao automático» → volta ao automático.
- Sistema, bitola e diâmetro acompanham a potência (só se não forem manuais). A mesma regra roda na Prévia (`sincronizarEntrada` em `lib/entrada-calc.ts`), então apagar um cômodo ou equipamento ajusta potência, bitola, prévia e PDF juntos.
- Orçamentos antigos com potência digitada são tratados como manuais.

## Outros
- Corrigido «1 disjuntores» no cartão de circuitos.
- Testes novos: `node tests/melhorias.test.mjs`.
