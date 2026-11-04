# Legislação de apoio da SOPH.IA

Textos copiados do acervo público `ctresb/leis` (o mesmo que o servidor leis-mcp consulta), com os metadados originais no cabeçalho de cada arquivo (`revogada`, `versao_texto`, `fonte`, `baixado_em`). São convertidos automaticamente das fontes oficiais e podem ter erros de conversão ou OCR. Não substituem a publicação oficial: confira o dispositivo na fonte antes de citá-lo em documento.

| Arquivo | Norma | Situação no acervo | Por que está aqui |
|---|---|---|---|
| `lei-13303-2016.md` | Lei 13.303/2016 (Estatuto das Estatais) | em vigor, texto compilado | Regime da SOPH; o art. 40 manda publicar o RILC |
| `lc-123-2006.md` | Lei Complementar 123/2006 | em vigor, texto compilado | Citada no RILC (tratamento de ME e EPP em licitações) |
| `lei-10520-2002-REVOGADA.md` | Lei 10.520/2002 (pregão) | **revogada** | O RILC a cita (art. 36 e glossário) e a afasta expressamente. Não aplicar como vigente |
| `lei-12815-2013.md` | Lei 12.815/2013 (Lei dos Portos) | em vigor, texto compilado | Inferência minha: base das concessões e arrendamentos portuários tratados no cap. V do RILC. Não é citada nominalmente no RILC |

## Lacuna conhecida

O art. 36 do RILC (Rev.1) aplica a **Lei 14.133/2021** apenas à etapa externa do pregão, da sessão pública até os recursos. O acervo `ctresb/leis` só traz a nota de retificação dessa lei (3 KB), não o texto compilado. O texto completo deve vir do Planalto ou de normas.leg.br e ser conferido por quem for usar.

## Fora de propósito

Não foram incluídas a LAI (12.527/2011), a Lei Anticorrupção (12.846/2013) e a LGPD (13.709/2018): o RILC cita a LAI só uma vez, e as outras não são citadas. Podem ser acrescentadas se a SOPH.IA passar a precisar delas.

## Para o Claude Code ao desenvolver (opcional)

O servidor leis-mcp dá ao assistente leitura exata de artigos: `uvx leis-mcp index` e `claude mcp add leis -- uvx leis-mcp serve` (requer uv). Ele não roda dentro das Cloudflare Pages Functions, por isso a SOPH.IA usa estes arquivos como fontes na Biblioteca, e não o servidor.
