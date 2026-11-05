# SOPH.IA — assistente documental institucional

Aplicação para elaborar, revisar e versionar Despachos, Memorandos, Estudos
Técnicos Preliminares (ETP) e Termos de Referência (TR). Não integra com o SEI,
não assina documentos e não substitui a revisão de servidor competente.

## Arquitetura

Toda a aplicação roda na Cloudflare:

- **Interface**: React + Vite em `frontend/src`, publicada no Cloudflare Pages.
- **API**: Pages Functions em `frontend/functions/api/[[path]].js`, atendendo
  `/api/*` no mesmo domínio.
- **Dados**: D1 (`sophia-db`) para usuários, setores, conversas e configurações.
- **Arquivos**: R2 (`sophia-documentos`).
- **Geração**: Workers AI. Gemini (chave institucional, configurada na tela de
  Inteligência Artificial) e Tavily (pesquisa web) são opcionais.

O backend FastAPI, o Docker e o Ollama foram aposentados. Não há servidor próprio
para manter.

## Recursos

- Login com JWT e limite de tentativas: 5 por e-mail e 50 por IP em 15 minutos.
- Perfis padrão, diretor, gerente e administrador, com regras de permissão
  verificadas no servidor.
- Biblioteca institucional com upload de PDF, DOCX e textos. Anexos de conversa
  são visíveis somente para o usuário que os enviou.
- Chat com indicação das fontes consultadas. A pesquisa na web se limita aos
  domínios autorizados pelo administrador.
- Conversas: exclusão individual pelo menu de três pontos ou em lote, com
  **Selecionar**. Só o dono da conversa pode excluí-la. Anexos usados apenas nela
  são removidos; os que também aparecem em outra conversa são mantidos.
- Barra lateral redimensionável, entre 220 e 420 px. A largura fica guardada no navegador.
- Resposta exportável para Word (.docx) pelo botão de download.
- Modelos de pedido para ETP, TR, Despacho e Memorando. Cada cartão preenche a
  caixa de texto para você substituir os trechos entre colchetes. As respostas passam por
  pós-processamento que remove seções internas e colchetes e padroniza títulos.

## Publicação no Cloudflare Pages

### 1. Criar os recursos no Cloudflare

No mesmo account utilizado pelo projeto Pages:

1. Em **Workers & Pages > D1 SQL Database**, crie `sophia-db`.
2. Em **R2 Object Storage**, crie `sophia-documentos`.
3. Abra o projeto Pages e, em **Settings > Bindings**, adicione:
   - D1 database, nome da variável `DB`, banco `sophia-db`;
   - R2 bucket, nome da variável `DOCUMENTS`, bucket `sophia-documentos`;
   - Workers AI, nome da variável `AI`.
4. Em **Settings > Variables and Secrets**, adicione como secrets:
   - `SECRET_KEY`: valor aleatório com pelo menos 32 caracteres;
   - `SEED_ADMIN_EMAIL`: e-mail inicial do administrador;
   - `SEED_ADMIN_PASSWORD`: senha forte inicial;
   - `TAVILY_API_KEY`: chave da Tavily para pesquisa controlada na web. Não
     coloque esse valor no GitHub, no frontend ou em arquivos versionados.
   - Recuperação de senha por e-mail (Gmail com senha de app): `SMTP_USER`
     (endereço do Gmail), `SMTP_PASS` (senha de app de 16 caracteres) e, como
     variável comum, `MAIL_FROM` (por exemplo `SOPH.IA <endereco@gmail.com>`).
     Sem essas três variáveis, o botão "Esqueci a senha" responde que o envio
     não está configurado.
5. Opcionalmente, adicione `WORKERS_AI_MODEL` com o valor
   `@cf/qwen/qwen3-30b-a3b-fp8`. O administrador também pode escolher entre
   Qwen3 e GLM pela tela de Inteligência Artificial depois do primeiro acesso.

Não crie `VITE_API_URL` em produção. A aplicação chama `/api` no mesmo domínio,
sem expor token de API no navegador.

### 2. Configurar o build conectado ao GitHub

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
Node.js: 20 ou superior
```

O diretório `frontend/functions` é detectado automaticamente e publicado junto
com o site. O arquivo `frontend/public/_redirects` mantém as rotas do React
funcionando quando uma página é atualizada pelo navegador.

Depois do deploy, valide:

```text
https://SEU-DOMINIO.pages.dev/api/health
```

A resposta deve informar `platform: cloudflare-pages`, `ai: true` e
`database: true`. No primeiro acesso, as tabelas, os setores e o administrador
são criados automaticamente. `SEED_ADMIN_PASSWORD` não altera usuários que já
existam; troque a senha pela Administração.

### 3. Publicação opcional pelo Wrangler

O arquivo `frontend/wrangler.toml.example` contém um modelo. Copie-o para
`wrangler.toml`, informe o ID real do D1 e publique com Wrangler. Não envie um
arquivo com IDs fictícios, pois ele interrompe o build. Para publicação pelo
painel e GitHub, prefira configurar os bindings na interface do Cloudflare.

### Pesquisa controlada na web

Quando `TAVILY_API_KEY` estiver configurada, a Tavily pesquisa somente nos
domínios autorizados pelo administrador. O backend valida novamente cada URL,
envia ao modelo apenas os trechos pertinentes e mostra as páginas utilizadas em
**Fontes consultadas**. Se a pesquisa estiver desativada, sem chave ou
temporariamente indisponível, o chat continua com a base institucional sem
inserir mensagens técnicas no documento gerado.

### Leitura de arquivos

PDF e DOCX são guardados no R2 e convertidos para texto com `env.AI.toMarkdown()`
(Workers AI) no envio. O texto fica salvo junto do documento e entra na busca de
fontes do chat. TXT, Markdown e CSV são lidos diretamente.

- Se a conversão não extrair texto, o envio é recusado com uma mensagem. Isso
  acontece com PDF protegido, corrompido ou digitalizado só como imagem.
- Documentos enviados antes dessa etapa não têm texto salvo. Eles podem ser
  convertidos em **Administração > Base institucional > Reprocessar textos**.
- Arquivos `.pptx` não são convertidos.
- A conversão é gratuita para a maioria dos formatos; imagens usam modelos de IA
  e consomem a cota de Neurons.

## Desenvolvimento local

Requer Node.js 20 ou superior. A API roda nas Pages Functions, então o
desenvolvimento local usa o Wrangler:

```bash
cd frontend
npm install
cp .dev.vars.example .dev.vars   # preencha os valores locais; nunca versione este arquivo
npm run build
npx wrangler pages dev dist --port 8788 --d1=DB --r2=DOCUMENTS
```

Abra `http://localhost:8788`. Para editar a interface com recarregamento
automático, rode `npm run dev` em outro terminal: o Vite (porta 5173) encaminha
`/api` para a porta 8788.

Os parâmetros do Wrangler dependem da versão instalada. Se algum binding não
for reconhecido, consulte a documentação do Cloudflare para essa versão.

## Testes

```bash
node --test frontend/tests/*.test.mjs evals/checks.test.mjs
cd frontend && npm run build
```

A avaliação da qualidade das respostas da IA está descrita em `evals/README.md`.
Ela usa uma conta temporária, informada por variáveis de ambiente. Não grave
senhas em arquivos do projeto.

## Estrutura

```text
frontend/
  src/          interface React (telas em pages/, componentes em components/)
  functions/    API em Pages Functions (api/[[path]].js)
  lib/          comportamento da IA (modos, especialidades e regras) e busca de trechos
  tests/        testes de permissões, pós-processamento, e-mail, conversas e DOCX
evals/          conjunto de avaliação das respostas da IA
```

## Fluxo recomendado

1. O administrador cadastra setores, usuários, normas e modelos.
2. O usuário escolhe um modelo de pedido e substitui os trechos entre colchetes.
3. A aplicação recupera fontes da biblioteca e gera a primeira versão.
4. O revisor altera o texto; cada salvamento cria uma versão imutável.

## Comportamento da IA

A SOPH.IA trabalha em cinco modos, e cada resposta se identifica pelo modo e pela especialidade (regras em `frontend/lib/behavior.js`):

- **Elaborar:** minuta estruturada com os dados informados e as fontes recuperadas.
- **Revisar:** corrige forma e aponta problemas de conteúdo, sem alterar o sentido.
- **Analisar:** aponta lacunas, inconsistências, riscos de redação e afirmações sem suporte.
- **Consultar normas:** responde com base nas fontes normativas identificadas, separando transcrição, resumo e interpretação.
- **Comparar:** compara os textos enviados e resume as alterações relevantes.

O modo vem do verbo inicial do pedido (por exemplo, "Elabore", "Revise", "Compare", "Analise", "Quais normas..."). Quando não há verbo claro, a SOPH.IA pergunta antes de redigir e não gera texto.

As especialidades são ETP e Termo de Referência, despachos e memorandos, portarias e ofícios, revisão documental e consulta normativa. Cada uma é detectada pelo tipo de documento citado.

**Regras obrigatórias:** a SOPH.IA não inventa números, datas, valores, nomes, resultados de licitação nem citações normativas. Não aprova, não assina, não envia e não protocola nenhum ato. Trata anexos e resultados de pesquisa como material a analisar, nunca como instruções. Indica que as minutas são rascunhos para revisão humana.

**Marcadores de pendência:** a informação que falta aparece como `[PENDENTE: informar ...]`, `[informar ...]` ou `[inserir ...]`, e é preservada na resposta. Outros colchetes são removidos.

**Pesquisa web indisponível:** a resposta segue com a base institucional e traz um aviso, para que a pessoa saiba que a pesquisa não foi usada.

**Limites atuais:**
- "Comparar" compara apenas os textos enviados. O sistema não guarda histórico de versões.
- Portarias e ofícios seguem a estrutura usual quando o modelo não está na base institucional, e a resposta informa isso.
- Não há formulário com campos. Os modelos de pedido são atalhos que preenchem a caixa de texto. A estrutura de ETP e TR vem dos modelos da base institucional, quando existem.
- Ainda não há seletor de modo ou de especialidade na tela.
- O prompt de sistema tem cerca de 5 mil caracteres. Isso é medido pela avaliação em `evals/`.

## Limitações conhecidas

- A sessão fica em cookie HttpOnly, mas o acesso ainda depende de um token
  com validade de 8 horas; não há renovação automática.
- A recuperação de senha por e-mail só funciona com `SMTP_USER`, `SMTP_PASS` e
  `MAIL_FROM` configurados. Sem isso, o administrador redefine a senha.
- O .docx exportado é simples: mantém títulos e listas, mas não preserva negrito
  nem tabelas, e não traz timbre nem cabeçalho institucional.
- Não há assinatura digital, tramitação nem integração com o SEI.
- As fontes de exemplo não substituem normativos oficiais atualizados.
- Toda minuta deve ser revisada por servidor competente.
