# SOPH.IA — MVP documental local

Aplicação local para elaboração, revisão e versionamento de Despachos, Memorandos,
Estudos Técnicos Preliminares (ETP) e Termos de Referência (TR). Não possui
integração com SEI e não exige serviço externo.

## Recursos

- autenticação JWT e perfis `admin`, `elaborador` e `revisor`;
- cadastro de usuários e setores;
- biblioteca institucional com upload e extração de PDF/DOCX;
- busca textual local e indicação das fontes usadas;
- formulários orientados para quatro tipos documentais;
- gerador local por templates, funcional mesmo sem modelo de IA;
- revisão assistida, histórico de versões e estados de aprovação;
- exportação para DOCX;
- conector opcional para Ollama, desativado por padrão;
- SQLite para desenvolvimento e PostgreSQL no Docker Compose.

## Início rápido com Docker

1. Copie `.env.example` para `.env`, altere `SECRET_KEY` e defina uma senha forte e exclusiva em `SEED_ADMIN_PASSWORD`.
2. Execute:

   ```bash
   docker compose up --build
   ```

3. Acesse `http://localhost:5173`.
4. Entre com o e-mail definido em `SEED_ADMIN_EMAIL` e a senha configurada em `SEED_ADMIN_PASSWORD`.

A API e sua documentação ficam em `http://localhost:8000/docs`.

> Nunca publique o arquivo `.env`. Use senhas e chaves exclusivas em cada implantação.

## Execução para desenvolvimento

Requer Python 3.11+ e Node.js 20+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux: source .venv/bin/activate
pip install -r requirements.txt
copy ..\.env.example ..\.env
uvicorn app.main:app --reload
```

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

## Aplicação integral na Netlify

O arquivo `netlify.toml` compila o React e publica uma API em **Netlify
Functions**. Autenticação, usuários, conversas e chat com Gemini deixam de
depender de um servidor FastAPI separado.

No painel do projeto `iasoph`:

1. Abra **Database** e crie/ative o banco do projeto. A Netlify disponibilizará
   `NETLIFY_DB_URL` automaticamente às Functions.
2. Em **Project configuration > Environment variables**, cadastre:
   - `SECRET_KEY`: valor aleatório com pelo menos 32 caracteres;
   - `SEED_ADMIN_EMAIL`: e-mail inicial do administrador;
   - `SEED_ADMIN_PASSWORD`: senha forte inicial;
   - `GEMINI_API_KEY`: chave do Google AI Studio;
   - `GEMINI_MODEL`: `gemini-2.5-flash` (opcional).
3. Marque senhas e chaves como secretas e disponíveis para **Functions**.
4. Execute **Deploys > Trigger deploy > Clear cache and deploy site**.

A aplicação utiliza `/api` no mesmo domínio. Não configure `VITE_API_URL` como
`localhost` na Netlify. Verifique a API em
`https://iasoph.netlify.app/api/health`.

`SEED_ADMIN_PASSWORD` só cria o administrador quando ainda não existe nenhum
usuário. Depois do primeiro acesso, altere a senha pela Administração.

Com `DATABASE_URL=sqlite:///./data/sophia.db`, o banco e as tabelas são criados
automaticamente. O seed cria dois setores, o usuário administrador e fontes
institucionais demonstrativas.

## Ollama (opcional)

O sistema começa com `AI_PROVIDER=template`, garantindo operação offline e
resultados previsíveis. Para ativar um modelo local:

```bash
docker compose --profile ai up -d ollama
docker compose exec ollama ollama pull qwen2.5:7b
```

Depois altere `.env`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:7b
```

Recrie o backend. O conector envia somente os campos preenchidos e os trechos das
fontes locais recuperadas. Em produção, escolha um modelo compatível com o
hardware, valide juridicamente os textos e mantenha revisão humana obrigatória.

## Pesquisa controlada na internet

A SOPH.IA pode pesquisar modelos e referências públicas quando não existir um
modelo institucional adequado. Essa função não envia documentos internos à
internet: somente a consulta textual necessária à pesquisa é encaminhada ao
serviço configurado. Por padrão, permanece desabilitada.

Configure no `.env` e reinicie o backend:

```env
WEB_SEARCH_ENABLED=true
OLLAMA_API_KEY=sua_chave
WEB_ALLOWED_DOMAINS=gov.br,planalto.gov.br,tcu.gov.br,cgu.gov.br,compras.gov.br,rondonia.ro.gov.br
WEB_SEARCH_MAX_RESULTS=4
WEB_SEARCH_TIMEOUT_SECONDS=20
```

A pesquisa somente é acionada em pedidos de elaboração documental. Resultados
fora dos domínios autorizados, sem pertinência com o pedido ou resolvidos para
endereços privados são descartados. Os modelos institucionais têm prioridade.
Quando o usuário pedir reprodução exata de um padrão específico que não esteja
na base, a SOPH.IA solicitará o documento-modelo em vez de inventar a estrutura.

## Estrutura

```text
backend/app/
  api/          rotas HTTP
  core/         configuração e segurança
  services/     documentos, extração, geração e DOCX
  models.py     entidades persistidas
  schemas.py    contratos da API
frontend/src/
  components/   layout e componentes compartilhados
  pages/        telas do sistema
```

## Fluxo recomendado

1. O administrador cadastra setores, usuários, normas e modelos.
2. O elaborador escolhe um tipo e preenche o formulário orientado.
3. A aplicação recupera fontes da biblioteca e gera a primeira versão.
4. O revisor altera o texto; cada salvamento cria uma versão imutável.
5. O documento é marcado como revisado/aprovado e exportado em DOCX.

## Segurança e limites do MVP

- O token fica no armazenamento local do navegador, adequado apenas ao MVP.
- Arquivos são validados por extensão e limitados a 15 MB.
- A busca inicial é textual, não vetorial. Pode ser substituída por pgvector sem
  alterar o fluxo funcional.
- Não há assinatura digital, protocolo, tramitação nem integração com o SEI.
- As fontes seed são exemplos, não substituem normativos oficiais atualizados.
- Toda minuta deve ser revisada por servidor competente.

## Testes

```bash
cd backend
pytest
```

Para validar o frontend:

```bash
cd frontend
npm run build
```
