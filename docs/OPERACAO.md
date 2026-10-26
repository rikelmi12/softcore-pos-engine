# Operacao da Morada da Pizza

## Producao

- Dominio: `https://softcore.cloud`
- Admin: `https://softcore.cloud/admin/`
- VPS: `127.0.0.1`
- Aplicacao: `/root/Teste cauan/cardapio/cardapio`
- Banco ativo: `/var/lib/cardapio/data/cardapio.db`
- Backups SQLite: `/var/lib/cardapio/data/backups`
- Backups de deploy: `/var/lib/cardapio/data/deploy-backups`
- Processo: `cardapio-api` no PM2
- Tunel: `Rikelmitunnel` no PM2

Nao coloque senhas, cookies, certificados, CSC, PIN gerencial ou token do
print-agent nesta documentacao.

## Comandos de verificacao

```bash
pm2 status
pm2 logs cardapio-api --err --lines 80 --nostream
curl https://softcore.cloud/api/health
```

Integridade do banco, com o caminho de producao:

```bash
sqlite3 /var/lib/cardapio/data/cardapio.db "PRAGMA integrity_check;"
sqlite3 /var/lib/cardapio/data/cardapio.db "PRAGMA foreign_key_check;"
```

Resultado esperado:

- `integrity_check`: `ok`
- `foreign_key_check`: nenhuma linha

## Backups

Antes de qualquer alteracao de dados, use a API de backup do SQLite ou a
funcao `backup()` de um cliente SQLite. Evite copiar somente o arquivo
principal enquanto houver WAL ativo.

Em 28/07/2026, a retencao automatica foi reduzida para dois arquivos `.db`.
O servidor considera todos os bancos dessa pasta, inclusive backups com nomes
manuais, e remove os mais antigos depois de criar uma nova copia consistente.

Backups preservados na reducao inicial:

- ultimo snapshot operacional:
  `backups/cardapio-2026-07-28T13-07-14-628Z.db`
- rollback anterior a correcao de seguranca:
  `backups/cardapio-pre-security-fix-20260728-1259.db`

## Banco de dados

O PM2 define:

```text
DATA_DIR=/var/lib/cardapio/data
```

Portanto, somente `/var/lib/cardapio/data/cardapio.db` e banco ativo.
Arquivos sob `backups/` sao copias consistentes e nao devem ser usados como
banco de execucao.

Em 26/07/2026, cinco diretorios antigos de testes do caixa foram arquivados
fora da VPS e removidos. A verificacao final nao encontrou bancos inesperados
na arvore da aplicacao.

## Busca do cardapio e admin

A busca:

- ignora acentos e caixa (`rucula` encontra `Rucula`);
- normaliza pontuacao e espacos;
- exige que todos os termos digitados aparecam em algum campo;
- considera nome, descricao, ingredientes, tamanho, badge, categoria e ID;
- no admin, tambem considera campos fiscais e codigos;
- a busca global do admin limpa os filtros de categoria/status;
- a lupa e um botao acessivel e focavel.

## Catalogo de pizzas

Estado esperado:

- 22 sabores, sendo 18 salgados e 4 doces;
- 3 tamanhos por sabor;
- 66 pizzas ativas;
- Calabresa, Calabresa Suprema, Tres Queijos e pizzas doces por
  `R$ 55`, `R$ 70` e `R$ 85` em P/M/G;
- ingredientes do cardapio fisico de 29/07/2026 preservados exatamente no
  painel "Ver ingredientes";
- `Chocolate 2 Amores` permanece com P/M/G desativadas.

Estado esperado das bebidas e bordas:

- 9 bebidas ativas;
- Coca-Cola Zero nao consta entre os produtos ativos;
- quatro bordas ativas: Mussarela, Catupiry, Calabresa e Mussarela, Frango e
  Catupiry;
- bordas tradicionais por `R$ 10`, `R$ 15` e `R$ 20`;
- bordas especiais por `R$ 20`, `R$ 25` e `R$ 30`.

Contato esperado:

- telefone visivel: `+55 (XX) XXXXX-XXXX`;
- WhatsApp: `+55 (XX) XXXXX-XXXX`.

Migracao auditavel:

```bash
npm run migrate:menu-report:dry-run -- --db /var/lib/cardapio/data/cardapio.db
```

## Caixa e fiscal

"Pedidos no Caixa" possui:

- periodo `De/Ate`;
- atalhos `Hoje` e `Todos`;
- coluna de data;
- contador;
- altura maxima com scroll interno;
- cabecalho fixo;
- ate 1000 pedidos no filtro.

As funcoes de comanda, recebimento, estorno, pre-validacao, transmissao,
impressao e cancelamento fiscal nao foram alteradas por essa mudanca de UI.

Nao teste transmissao ou cancelamento em producao apenas para verificar a
interface: essas acoes mudam o estado fiscal real.

## PWA e anuncio de instalacao

Arquivos:

- `manifest.json`
- `service-worker.js`
- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`
- `assets/icons/apple-touch-icon.png`

Acao reservada para anuncios:

```text
#instalar-app
```

Comportamento:

- Chromium compativel: abre o prompt nativo salvo por
  `beforeinstallprompt`.
- iPhone/iPad: mostra guia para Safari, Compartilhar e Adicionar a Tela de
  Inicio.
- App ja instalado: oculta somente anuncios com `#instalar-app`.
- Outros anuncios continuam funcionando.
- Service worker usa rede primeiro e nao intercepta `/api/`, `/admin/` nem
  `/order-receipts/`.

## Protecao de arquivos e dados do navegador

Somente estes recursos da raiz podem ser servidos diretamente:

- arquivos publicos do cardapio (`script.js`, `style.css`, manifesto, icones
  e service worker);
- imagens/fontes sob `assets/`;
- `lib/pizza-options.js`;
- `admin.html`, `admin.js` e `admin.css` pelas rotas do painel.

Backups, testes, ferramentas, `.env`, banco, certificado, documentacao
interna, arquivos desconhecidos e outros modulos retornam `403`. Recursos
estaticos aceitam somente `GET` e `HEAD`.

O cache local do admin remove senha do certificado, CSC de todos os ambientes
e PIN do gerente. No logout, o cache fiscal e os campos sensiveis em memoria
sao limpos e a pagina e recarregada.

Comprovantes novos recebem link assinado temporario. Comprovantes antigos ou
links vencidos continuam acessiveis somente com uma sessao administrativa.

## Rollback

1. Identifique o backup exato.
2. Confirme o caminho real da aplicacao e do banco.
3. Salve uma copia do estado atual.
4. Restaure somente os arquivos/secoes relacionados a mudanca.
5. Reinicie `cardapio-api` somente quando o servidor ou banco exigir.
6. Verifique `pm2 status`, `/api/health`, logs e os endpoints afetados.

Nunca use um comando destrutivo contra a raiz do projeto, `/root`, `/` ou uma
variavel de caminho nao validada.
