# Avaliação da IA da SOPH.IA

Conjunto fixo de 15 pedidos (ETP, TR, despacho, memorando, revisão e perguntas) com checagens automáticas
para as falhas que já apareceram na prática: colchetes e "informação a completar", títulos em caixa alta,
seções internas, comentários sobre a IA, campos de SEI não pedidos, resposta curta e pedido não atendido.
Referências legais que não estão no pedido geram aviso para revisão humana, não reprovação.

## Arquivos

- `requests.json`: os 15 pedidos e os termos que cada resposta precisa tratar.
- `checks.mjs`: as regras. Cada regra indica o motivo da reprovação.
- `run-checks.mjs`: confere respostas já geradas em `evals/out/` (ou em outra pasta informada).
- `run-live.mjs`: gera as respostas no ambiente publicado e grava em `evals/out/`.
- `checks.test.mjs`: testes do próprio verificador.

## Como rodar

Testes do verificador (não usam a IA):

```bash
node --test evals/checks.test.mjs
```

Gerar respostas no site publicado (cria 15 conversas "Avaliação <id>" na conta informada):

```bash
SOPH_EVAL_URL=https://soph-ia.pages.dev SOPH_EVAL_EMAIL=seu-email@soph.ro.gov.br SOPH_EVAL_PASSWORD='sua-senha' node evals/run-live.mjs
```

Conferir as respostas geradas:

```bash
node evals/run-checks.mjs
```

O comando sai com código 1 se algum caso falhar ou se alguma resposta estiver faltando.

## Limites

- As regras pegam problemas de forma, de estrutura e de cobertura do pedido. Não substituem a revisão
  jurídica nem verificam se os fatos estão corretos.
- Os termos obrigatórios de cada pedido são uma checagem simples de cobertura. Uma resposta correta com
  outras palavras pode ser reprovada; nesse caso, ajuste o termo em `requests.json`.
- Respostas geradas ficam em `evals/out/`, pasta ignorada pelo Git.
