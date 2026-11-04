# Mapa: art. 29 do RILC da SOPH x campos do ETP e do TR da SOPH.IA

Contexto para o Claude. A SOPH (Sociedade de Portos e Hidrovias do Estado de Rondônia) é regida pela Lei 13.303/2016 e pelo seu RILC, e não pela Lei 14.133/2021. A SOPH.IA é um assistente que gera Despacho, Memorando, ETP e Termo de Referência (repositório `apop14520-glitch/SOPH.IA`).

Fonte: RILC da SOPH aprovado pelo CONSUP e pela DIREX em 30/11/2023 (impressão SEI de 24/01/2024, 78 páginas), art. 29. Itens I e X foram incluídos pela Rev.1. Texto extraído de PDF: confira os artigos na versão oficial antes de citar. Não li o regulamento inteiro, só o art. 29, o art. 30, o trecho de registro de preços e os parágrafos do ETP.

## Art. 29: fase de preparação (16 incisos)

Legenda de cobertura: OK = o campo atual já cobre; PARCIAL = cobre em parte; FALTA = não existe campo.

| Inciso | Exigência do RILC | Campo do ETP atual (`generator.py`) | Campo do TR atual | Cobertura |
|---|---|---|---|---|
| I (Rev.1) | Descrição da necessidade que caracterize o interesse público | `problema` (2. Problema e necessidade) | `justificativa` | OK no ETP; pedir o "interesse público" explicitamente |
| II | Justificativa da contratação | `problema`, `resultados` | `justificativa` (2. Fundamentação) | PARCIAL: não há campo separado de justificativa no ETP |
| III | Objeto da contratação | `objeto` | `objeto` | OK |
| IV | Orçamento e preço de referência, remuneração ou prêmio | `estimativa_valor` | `estimativa_valor` | PARCIAL: falta a metodologia da pesquisa de preços e a fonte dos preços |
| V | Requisitos de conformidade das propostas | `requisitos` | `especificacoes` | PARCIAL |
| VI | Cláusulas do contrato, inclusive sanções e prazos de fornecimento | (não se aplica ao ETP) | `sancoes_riscos`, `execucao`, `pagamento` | PARCIAL: falta matriz de riscos como campo próprio (a Lei 13.303, art. 69, X, a exige no contrato) |
| VII | Procedimento da licitação: regime ou forma de execução, modo de disputa, critério de julgamento | `alternativas`, `solucao` | `selecao` | PARCIAL: faltam campos separados de regime de execução, modo de disputa e critério de julgamento |
| VIII-A | Justificativa dos fatores de ponderação (técnica e preço) | FALTA | FALTA | FALTA (só quando o critério for técnica e preço) |
| VIII-B | Justificativa de marca ou modelo (padronização com parecer técnico; marca única; marca como referência com "ou similar ou de melhor qualidade") | FALTA | `especificacoes` | FALTA: campo condicional |
| VIII-C | Exigência de amostra | FALTA | FALTA | FALTA: campo condicional |
| VIII-D | Exigência de certificação de qualidade | FALTA | FALTA | FALTA: campo condicional |
| VIII-E | Exigência de carta de solidariedade do fabricante | FALTA | FALTA | FALTA: campo condicional |
| VIII-F | Antecipação de pagamento, quando for o caso | FALTA | `pagamento` | PARCIAL |
| VIII-G | Variáveis do custo do ciclo de vida: aquisição, manutenção, operação, descarte | `sustentabilidade` (parcial) | FALTA | FALTA: campo de ciclo de vida |
| IX | Indicação de fonte de recursos suficientes | FALTA | FALTA | FALTA: dotação orçamentária |
| X (Rev.1) | **ETP**: necessidade e interesse público, melhor solução, fundamentando anteprojeto, TR ou projeto básico, se a contratação for viável | o próprio documento ETP | n/a | OK: seção 11 (conclusão) deve dizer se a contratação é viável |
| XI | **Termo de Referência** com elementos necessários e suficientes, nível de precisão adequado, para caracterizar o objeto e permitir estimar o valor | n/a | o próprio documento TR | OK; revisar precisão |
| XII | Projeto básico (obras e serviços de engenharia, salvo contratação integrada) | n/a | FALTA | FALTA: só para engenharia |
| XIII | Justificativa da disposição do objeto em lotes ou parcelas | `alternativas` (parcial) | `especificacoes` (parcial) | PARCIAL: pedir justificativa de parcelamento |
| XIV | Instrumento convocatório | n/a | n/a | Fora do escopo atual da SOPH.IA (art. 30 lista o conteúdo do edital) |
| XV | Minuta do contrato, quando houver | n/a | n/a | Fora do escopo atual |
| XVI | Ato de designação da comissão de licitação | n/a | n/a | Fora do escopo atual (poderia ser um Despacho) |

## Regras do ETP no RILC (versão 2023/2024)

- Facultativo: nas hipóteses dos incisos VI e XV do art. 87 do RILC e VI e XV do art. 29 da Lei 13.303.
- Dispensado: nos incisos III e IV do art. 87 do RILC, III e IV do art. 29 da lei e nas prorrogações de serviços e fornecimentos contínuos.
- Registro de preços (SRP): após formalizar o ETP, a unidade requisitante faz a minuta do TR e pede apoio da área de compras para a Intenção de Registro de Preços (IRP). Na participação na origem, o processo simplificado exige memorando de solicitação da demanda e ETP, que deve mostrar compatibilidade com o TR do órgão gerenciador. Na adesão a ata, exige também pesquisa de preços que comprove a vantajosidade.
- Confirme a numeração do art. 87 lendo o artigo inteiro; a citação acima vem de referência cruzada.

## Campos sugeridos para a SOPH.IA (a validar com quem usa o sistema)

Para o ETP: `interesse_publico`, `justificativa`, `metodologia_pesquisa_precos`, `fonte_recursos`, `parcelamento_lotes`, `ciclo_de_vida`, `viabilidade` (sim/não e motivo).

Para o TR: `regime_execucao`, `modo_disputa`, `criterio_julgamento`, `matriz_riscos`, `fonte_recursos`, e os condicionais `marca_modelo`, `amostra`, `certificacao`, `carta_solidariedade`, `antecipacao_pagamento`, `fatores_ponderacao`.

Para engenharia: exigir projeto básico (inciso XII) ou registrar contratação integrada.

## Instruções ao Claude neste chat

1. Use este mapa como checklist ao revisar ou gerar ETP e TR; aponte lacunas por inciso.
2. Não invente números de artigo, valores nem dispositivos; cite só o que está neste arquivo ou no texto oficial fornecido.
3. Campos condicionais só se aplicam quando a hipótese ocorrer (por exemplo, marca ou modelo).
4. Quando faltar um dado, diga o que falta em vez de preencher com marcadores ou colchetes.
5. Toda minuta precisa de revisão humana e conferência na versão vigente do RILC.
