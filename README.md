# Leitor UDI

Aplicativo de celular para ler o UDI de dispositivo médico no recebimento. Funciona no navegador, instala na tela inicial e, depois da primeira abertura, segue sem internet. Planilha, fotos e histórico ficam só no aparelho.

As três agências credenciadas pela FDA estão cobertas, conforme o documento **UDI formats by FDA-Accredited Issuing Agency, versão 1.4, 1º de setembro de 2025** (o inglês é a fonte; a tradução em português foi só apoio):

- **GS1** — Application Identifiers, inclusive Digital Link
- **HIBCC** — LIC/SLS, com a tabela de delimitadores `+`, `$$7`, `$`, `$$`, `$$2`–`$$6`, `$$+7`, `$+`, `$$+`, `$$+2`–`$$+6`, `/S`, `/16D`, `/14D`
- **ICCBBA / ISBT 128** — `=/`, `=,`, `=`, `=>`, `=}`, `&,1`, e bolsas `=)` / `&)`

## Instalar no Android

O aplicativo está publicado em [https://murillounder.github.io/leitor-udi-gs1/](https://murillounder.github.io/leitor-udi-gs1/).

1. Abra esse endereço no Chrome (a câmera não funciona em página sem cadeado).
2. Menu do Chrome → **Instalar app** ou **Adicionar à tela inicial**.
3. Abra pelo ícone. A partir daí a leitura funciona offline.

## O que a leitura faz

- Câmera traseira em resolução cheia, com escolha da lente, zoom e lanterna. **Ler de foto** abre a câmera do Android e decodifica a foto inteira; a galeria e o texto colado (leitor USB) continuam disponíveis.
- Prefixo de simbologia `]d2`, `]C1`, `]Q3` e `]e0`. O GS (ASCII 29) separa campos variáveis. Também valem `<GS>`, `{GS}` e um caractere substituto (o padrão é `|`), porque muitos leitores de teclado descartam o GS.
- A tabela GS1 sai do arquivo oficial `vendor/gs1-syntax-dictionary/gs1-syntax-dictionary.txt` (Apache 2.0, commit `bc3bff0`).
- Conferência com uma planilha `.xlsx` ou `.csv` de colunas **modelo**, **nível de embalagem** e **GTIN** (ou **DI**). Colunas extras, como quantidade por embalagem, aparecem ao lado do resultado. O arquivo de exemplo em `public/exemplos/` é fictício.
- Alerta se a validade (GS1 `(17)`, data de validade HIBCC ou `=>` do ISBT 128) é anterior a hoje em `America/Sao_Paulo`.
- Texto legível GS1 (HRI) no formato `(01)…(17)…(10)…`, com a lista de conferência do GSCN WR14-175 / GS1 General Specifications v15, seções 4.14 e 4.14.1. A árvore de decisão só entra como aviso: vale quando falta espaço e não há conflito com regulamento.
- Cada leitura bem-sucedida por câmera ou galeria grava a imagem (JPEG, com o retângulo do código quando a posição vem do decodificador) no IndexedDB, junto com data/hora, agência, texto bruto e o passo a passo: prefixo, agência, cada campo, conferência da planilha, HRI e resultado.
- O histórico agrupa em **lotes de conferência**: leituras seguidas do mesmo DI e do mesmo lote entram na lista aberta, com a contagem na tela de leitura. DI ou lote diferente fecha a lista sozinho e avisa **Novo lote/produto iniciado**. Dá para **Fechar lista** na mão, ou ver o mesmo histórico **por dia** ou **por hora**. Cada lote mostra modelo, DI, lote, validade, primeira e última leitura, quantidade, OK, divergentes e série repetida.
- Exportação no próprio aparelho: CSV, Excel, ZIP com as fotos, PDF de uma leitura, Excel e PDF de um lote (resumo em cima, depois cada leitura com miniatura e o passo a passo).

A tela **Elementos** é a comparação IMDRF / EUDAMED / GUDID (revisão 2019-02-18), só a aba curta. A aba enorme do IMDRF de 2013 não entra no aplicativo. O **SIUD da Anvisa (RDC 591/2021) não está nesse arquivo**; os campos do Brasil precisam ser conferidos no material da própria Anvisa.

## Limites

O leitor confere conteúdo e sintaxe. Não mede grau de impressão segundo ISO/IEC 15415 ou ISO/IEC 15416.

Não é um sistema validado e não é um registro GxP. Se for usado como registro de qualidade, precisa de validação de sistema computadorizado (GAMP 5).

Não há servidor, conta nem rastreamento. Nada da leitura é enviado para fora do aparelho. Links de norma, quando aparecem, só abrem se você tocar neles.

## O que a norma cita e este leitor não executa

- Linters GS1 além de dígito módulo 10, data `AAMMDD` / `AAAAMMDD` e conjunto de caracteres (país ISO, posição do prefixo de empresa, IBAN e outros) não rodam. O tamanho e o conjunto de cada AI vêm do dicionário.
- O século da data GS1 de dois dígitos segue o linter `yymmd0` do dicionário: janela móvel em torno do ano corrente. Dia `00` é o fim do mês.
- A tabela FDA não define o século das datas HIBCC de dois dígitos. Este leitor mostra `20AA` e avisa isso. Em data só com mês e ano, o alerta de validade usa o último dia do mês — a tabela não fixa o dia.
- No exemplo HIBCC da FDA, o caractere final é `C`. Pelo Mod 43 do apêndice B do ANSI/HIBC 2.5 (soma de todos os caracteres, inclusive o `+`), o cálculo dá `H`. O leitor separa os campos e marca o verificador como divergente. Não força o exemplo a passar.
- Lote e série HIBCC são lidos até o próximo `/` ou até o verificador, no máximo 18 caracteres (tamanho de banco da tabela). A faixa 7 a 24 do DI é avisada quando o tamanho sai dela. A estrutura interna do LIC (empresa, catálogo, unidade de medida) não é separada: a v1.4 não publica essa gramática.
- O caractere K do ISBT 128 (ISO/IEC 7064 Mod 37-2, ST-001 §7.5) não faz parte do código de barras. O leitor calcula o K dos 13 caracteres do código de doação, sem as duas bandeiras, e mostra o resultado. Não aplica Mod 37-2 aos outros campos da tabela FDA, porque os tamanhos publicados não incluem esse caractere.
- Ano juliano ISBT `AAAJJJ`: `014` vira 2014 (`2000 + AAA`). A tabela FDA não descreve o século; o exemplo oficial usa 013 e 014 ao lado de datas de 2013 e 2014.
- A conferência de HRI não decide arte nem embalagem. O AI `(8200)` fica de fora do HRI. O AI `(7004)` não é exigido no HRI.

## Desenvolvimento

Requer Node.js 22.

```bash
npm ci
npm test
npm run dev
```

O servidor de desenvolvimento sobe em [http://127.0.0.1:43127](http://127.0.0.1:43127). Nesse endereço a câmera do celular não abre: falta HTTPS e o aparelho não enxerga o `127.0.0.1` do computador.

`npm test` cobre o parser GS1 (campo fixo e variável, GS, `]d2`, parênteses, Digital Link), dígito, datas, indicador 9, SSCC, AI desconhecido, conferência da planilha, produto vencido, os três exemplos em texto da FDA, os delimitadores HIBCC, a bolsa ISBT 128, os lotes de conferência e a leitura de imagens DataMatrix e QR geradas no teste.

## Publicar no GitHub Pages

O aplicativo está no ar em [https://murillounder.github.io/leitor-udi-gs1/](https://murillounder.github.io/leitor-udi-gs1/).

No Android, abra esse endereço no Chrome, toque no menu e escolha **Instalar app** ou **Adicionar à tela inicial**. Abra pelo ícone; depois da primeira abertura a leitura segue sem internet.

O fluxo `.github/workflows/pages.yml` publica a cada push em `main`, com o GitHub Pages na fonte **GitHub Actions**. Não coloque planilha real nem segredo no repositório. O exemplo versionado é fictício.
