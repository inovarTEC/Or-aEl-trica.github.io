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


---
# Versão final (etapas de demanda e circuitos)

## Demanda e entrada
- Ar-condicionado pela Tabela 11 (BTU → VA); a capacidade escolhida fica guardada no equipamento.
- Potência estimada da entrada: carga instalada (kW) nas ligações monofásica/bifásica, demanda (kVA) na trifásica.
- Aviso quando a soma real dos circuitos (NBR 5410) passa do limite em kW da categoria da DIS-NOR-030.
- Removido o segundo motor de demanda que ninguém usava.

## Circuitos
- Um único ponto de entrada para a lista de circuitos (`montarCircuitos`): cálculo, prévia, PDF, avisos e tela leem dele.
- Regras: banheiro divide com quarto/sala (com DR); iluminação divide com qualquer cômodo; tomadas de cozinha/serviço só entre si;
  área externa com aviso; teto de 2.500 VA por circuito.
- Equipamento pequeno (≤ 10 A, mesma tensão das tomadas) pode dividir o circuito de tomadas do cômodo.
- Tela nova: dois modelos (Econômico, Mais econômico) + lista de circuitos editável (mover, separar, juntar, metros de cabo).
- O modo "Separado" saiu da tela; vive só como base de comparação ("economiza X disjuntores").
- Cada circuito leva o nome (e os cômodos) de quem realmente o usa.

## Testes
- `rede-seguranca` (5 casas × 4 modos, com PDF), `circuitos-personalizado` (300 listas aleatórias), `limpeza-final` (apagar cômodo,
  equipamento ou pontos em todos os modos), além dos testes anteriores. Rodar todos: `for %f in (tests\*.test.mjs) do @echo ===== %f && node %f` (CMD).

## Mantido de propósito
- Modos antigos `manual` e `norma` no servidor: só para abrir orçamentos antigos (viram a lista nova) e para a comparação dos cards.
- Funções de `lib/motor/eletrica.ts` sem uso (decisão do dono do projeto: não remover).


## Estado, tensão e ligação trifásica
- Etapa 1 (Imóvel): estado (UF) e tensão da localidade. É o mesmo dado da etapa Entrada de energia (já abre preenchida). O estado é obrigatório.
- "Não sei" adota 220/127 V em todo o app (rótulos do sistema: monofásico 127 V, bifásico 220 V, trifásico 220 V).
- Circuitos: mostra a tensão das tomadas do imóvel; sem estado, um aviso com o seletor ali mesmo.
- Aviso de limite da categoria: acima do limite recomenda ligação trifásica (categoria, disjuntor, cabo) com o botão "Usar trifásico";
  entre 90% e 100% só alerta com a alternativa. O quadro mostra a demanda (kVA) quando a ligação é trifásica.
