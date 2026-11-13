# Decisões do motor de cálculo (v2.0.0)

Valores padrão aplicados às "decisões em aberto" da especificação. Todos aparecem como premissa no PDF.

1. Disjuntor mínimo de 10 A em TUG, iluminação e TUE.
2. Meta de queda de tensão de 3% no circuito terminal (a NBR 5410 6.2.7 admite 4%).
3. Circuitos: por padrão, um de iluminação e um de TUG por cômodo. O usuário pode escolher (etapa Equipamentos → "Circuitos do quadro") juntar luz+tomadas num disjuntor e/ou juntar cômodos vizinhos (lib/server/circuitos.ts). Regras: banheiro/lavabo/garagem/varanda/áreas externas nunca dividem circuito (DR); cozinha/copa/serviço/lavanderia só entre si e sem luz junto (NBR 5410 9.5.3.2); mesma instalação no grupo; teto de 2.500 VA por circuito agrupado (premissa, A VALIDAR). O cabo do grupo é medido uma vez: trajeto do 1º cômodo + metros extras até o último cômodo que usa o circuito. Orçamentos sem essa configuração (antigos) continuam no padrão separado.
4. Interruptor paralelo/intermediário: 2 retornos (ainda não somados à lista — pendente).
5. Caixa 4x4 com até 6 módulos.
6. Pedidos já pagos são regerados com o motor novo; a versão do motor sai no PDF.
7. Diâmetros de eletroduto e área dos cabos: valores atuais, A VALIDAR.
8. Fatores g, h e i da DIS-NOR-030 = 1,00 (conservador).

Projetos antigos sem sistema de tensão informado usam 220/127 V, com aviso no PDF.
