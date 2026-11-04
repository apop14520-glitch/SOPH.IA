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
- Formulários para ETP, TR, Despacho e Memorando. As respostas passam por
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

### Limitação atual de leitura de arquivos

PDF e DOCX são guardados e podem ser visualizados ou baixados pelo R2. Arquivos
TXT, Markdown e CSV também têm o texto incorporado diretamente ao contexto. A
extração completa de PDF/DOCX no ambiente Cloudflare deve ser adicionada em uma
segunda etapa com pipeline de extração ou AI Search; o sistema não afirma ter
lido conteúdo que ainda não foi extraído.

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
node --test frontend/tests/permissions.test.mjs frontend/tests/postprocess.test.mjs evals/checks.test.mjs
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
  tests/        testes de permissões e de pós-processamento
  netlify/      implantação antiga na Netlify (legado)
evals/          conjunto de avaliação das respostas da IA
```

## Fluxo recomendado

1. O administrador cadastra setores, usuários, normas e modelos.
2. O usuário escolhe o tipo de documento e preenche o formulário orientado.
3. A aplicação recupera fontes da biblioteca e gera a primeira versão.
4. O revisor altera o texto; cada salvamento cria uma versão imutável.

## Limitações conhecidas

- O token de sessão fica no `localStorage` do navegador, o que é aceitável
  apenas para o MVP.
- Não há recuperação de senha por e-mail. O administrador redefine a senha.
- Não há exportação para DOCX na versão do Cloudflare.
- Não há assinatura digital, tramitação nem integração com o SEI.
- As fontes de exemplo não substituem normativos oficiais atualizados.
- Toda minuta deve ser revisada por servidor competente.

## Aplicação na Netlify (legado)

O arquivo `netlify.toml` compila o React e publica uma API em **Netlify
Functions** (`frontend/netlify/functions/api.mjs`). Essa implantação é antiga e
pode não acompanhar as mudanças feitas na versão do Cloudflare.

No painel do projeto:

1. Abra **Database** e ative o banco do projeto. A Netlify disponibiliza
   `NETLIFY_DB_URL` às Functions.
2. Em **Project configuration > Environment variables**, cadastre `SECRET_KEY`,
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `GEMINI_API_KEY` e,
   opcionalmente, `GEMINI_MODEL` (`gemini-2.5-flash`).
3. Marque senhas e chaves como secretas e disponíveis para **Functions**.
4. Execute **Deploys > Trigger deploy > Clear cache and deploy site**.

Verifique a API em `https://iasoph.netlify.app/api/health`.
