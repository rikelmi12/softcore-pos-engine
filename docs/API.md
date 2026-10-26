# API da Morada da Pizza

Referencia atualizada em 11/08/2026 a partir das rotas implementadas em
`server.mjs`.

## Convencoes

- Producao: `https://softcore.cloud`
- Desenvolvimento: `http://localhost:8000`
- Corpos de requisicao e resposta: JSON, salvo endpoints de download.
- Limite padrao do corpo JSON: 24 MiB, configuravel por
  `MAX_JSON_BODY_BYTES`.
- Endpoints admin usam o cookie `bf_admin_session` (`HttpOnly`,
  `SameSite=Strict`).
- Endpoints do print-agent usam `Authorization: Bearer <token>` ou
  `X-Print-Agent-Token`.
- Escritas publicas validam origem e possuem rate limit.

Codigos mais comuns:

| Codigo | Significado |
|---|---|
| `200` | Consulta ou alteracao concluida |
| `201` | Registro criado |
| `202` | Pedido publico recebido e aguardando confirmacao |
| `400` | Corpo, campo ou operacao invalida |
| `401` | Sessao ou token ausente/invalido |
| `403` | Origem ou autorizacao gerencial invalida |
| `404` | Registro/rota nao encontrado |
| `409` | Conflito de estado ou recurso indisponivel |
| `413` | Corpo acima do limite |
| `429` | Rate limit |
| `500` | Falha interna |

## Endpoints publicos

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/health` | Saude do servidor. Resposta: `{"ok":true}`. |
| `GET` | `/api/data` | Estado publico atual do cardapio. Remove produtos inativos e dados fiscais. |
| `GET` | `/api/data/manifest` | Hash/data de atualizacao das secoes publicas. |
| `GET` | `/api/default-data` | Snapshot publico padrao, somente com itens ativos. |
| `GET` | `/api/data/:section` | Le uma secao publica. |
| `POST` | `/api/order-logs` | Registra uma pendencia de pedido para confirmacao administrativa. |
| `POST` | `/api/order-receipts` | Envia comprovante Pix validado e devolve link assinado temporario. |

Secoes conhecidas:

- Objetos: `config`, `visual`, `orders`, `fiscal`.
- Listas: `categories`, `products`, `combos`, `promotions`,
  `announcements`, `borders`.
- `fiscal` e privada e exige sessao admin.

Exemplo de verificacao:

```bash
curl https://softcore.cloud/api/health
```

O `POST /api/order-logs` aceita o payload do checkout e responde `202` para
uma pendencia nova ou `200` para um replay idempotente. A pendencia nao altera
estoque, nao entra no caixa/fiscal e nao cria job de impressao. O servidor
define codigo/data/loja, canoniza os dados de pagamento e valida catalogo,
precos, totais, loja aberta, valor minimo e regras do tipo de pedido. O codigo
`WEB-XXXXXXXX` correlaciona a pendencia com a conversa recebida no WhatsApp.

Somente `POST /api/order-logs/:id/confirm`, com sessao admin, promove a
pendencia. A transicao, a baixa de estoque e a criacao do job inicial ocorrem
de forma atomica e idempotente. Pendencias expiram automaticamente e possuem
limites persistentes por origem e para a fila global.

O `POST /api/order-receipts` aceita somente PNG, JPEG ou WebP dentro do limite
configurado. O campo `receipt.url` possui `expires` e `sig`; por padrao, o
link assinado vale por 30 dias. Depois do vencimento, ou para comprovantes
antigos sem assinatura, uma sessao administrativa valida continua permitindo
o acesso. O service worker nunca armazena comprovantes.

## Autenticacao admin

| Metodo | Rota | Autenticacao | Descricao |
|---|---|---|---|
| `GET` | `/api/admin/session` | Nao | Informa se a sessao esta autenticada. |
| `POST` | `/api/admin/login` | Nao | Cria sessao a partir de `user` e `password`. |
| `POST` | `/api/admin/logout` | Cookie | Encerra e limpa a sessao. |
| `GET` | `/api/admin/data` | Cookie | Retorna o estado completo, incluindo fiscal. |

Exemplo de login:

```bash
curl -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"<senha>"}' \
  https://softcore.cloud/api/admin/login
```

Nunca grave senhas, cookies ou tokens em documentacao, repositorio ou logs.

## Catalogo e configuracoes

| Metodo | Rota | Descricao |
|---|---|---|
| `PUT` | `/api/data` | Atualiza uma ou mais secoes validas. |
| `PUT` | `/api/data/:section` | Atualiza uma secao. |
| `POST` | `/api/products/upsert` | Cria ou atualiza produto. |
| `DELETE` | `/api/products/:id` | Exclui produto pelo ID. |

Alteracoes da secao `fiscal` podem exigir PIN gerencial, conforme a
configuracao do caixa.

### Acao de instalacao em anuncios

Um anuncio pode usar:

```json
{
  "buttonLabel": "Quero instalar o app",
  "buttonUrl": "#instalar-app"
}
```

Essa URL reservada nao navega para outra pagina. Ela abre o prompt nativo
quando disponivel e, nos demais navegadores, mostra as instrucoes manuais.
Somente anuncios com essa acao sao ocultados quando o app ja esta instalado.

## Pedidos e impressao manual

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/order-logs?limit=200` | Lista pedidos registrados e devolve `totalCount`/`pendingCount` independentes do limite. Limite efetivo entre 1 e 1000. |
| `POST` | `/api/order-logs/:id/confirm` | Confirma uma pendencia publica e aplica seus efeitos uma unica vez. |
| `DELETE` | `/api/order-logs/:id` | Exclui pedido sem referencias financeiras/fiscais. |
| `POST` | `/api/order-logs/:id/print` | Imprime uma comanda silenciosamente. |
| `POST` | `/api/order-logs/print-test` | Testa a impressao silenciosa. |

A exclusao de uma pendencia equivale a rejeita-la e nao restaura estoque. A
exclusao de pedido confirmado restaura somente vendas realmente registradas
no historico de estoque. A exclusao e bloqueada quando existem referencias de
caixa, fiscais ou de comanda.

## Caixa

Todos os endpoints desta secao exigem sessao admin.

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/cashier/summary` | Sessao ativa, totais, movimentos e documentos recentes. |
| `GET` | `/api/cashier/sessions` | Lista sessoes de caixa. |
| `GET` | `/api/cashier/sessions/:id` | Detalhes de uma sessao. |
| `POST` | `/api/cashier/open` | Abre o caixa. |
| `POST` | `/api/cashier/close` | Fecha o caixa. |
| `POST` | `/api/cashier/movements` | Cria suprimento, sangria, ajuste ou estorno. |
| `POST` | `/api/cashier/orders/:id/receive` | Recebe um pedido no caixa. |
| `POST` | `/api/cashier/orders/:id/refund` | Estorna o recebimento. |

Filtros de `/api/cashier/sessions`:

- `status` (padrao: `closed`)
- `operator`
- `dateFrom` (`YYYY-MM-DD`)
- `dateTo` (`YYYY-MM-DD`)
- `limit` (padrao: `80`)

O painel "Pedidos no Caixa" carrega no maximo 1000 pedidos, filtra por
periodo no cliente e mantem a tabela em uma caixa com rolagem.

## Fiscal

Todos os endpoints desta secao exigem sessao admin. Operacoes sensiveis podem
exigir `managerPin`.

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/fiscal/status` | Prontidao fiscal e permissoes do caixa. |
| `GET` | `/api/fiscal/sefaz-status` | Consulta de disponibilidade/configuracao SEFAZ. |
| `GET` | `/api/fiscal/documents?limit=80` | Lista documentos fiscais e devolve `totalCount` independente do limite. |
| `GET` | `/api/fiscal/documents/:id` | Carrega um documento fiscal completo por ID para transmissao ou impressao. |
| `GET` | `/api/fiscal/events?limit=80` | Lista eventos fiscais. |
| `POST` | `/api/fiscal/documents` | Cria documento pre-validado para um pedido. |
| `POST` | `/api/fiscal/documents/:id/transmit` | Transmite documento para a SEFAZ. |
| `POST` | `/api/fiscal/documents/:id/cancel` | Cancela documento e registra evento. |
| `POST` | `/api/fiscal/inutilizations` | Solicita inutilizacao de numeracao. |
| `POST` | `/api/fiscal/contingency` | Atualiza o modo de contingencia. |

As rotas validam ambiente, numeracao, perfil tributario, operacao fiscal,
certificado e autorizacao gerencial antes de executar a acao.

## Estoque

Todos os endpoints desta secao exigem sessao admin.

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/stock` | Snapshot de saldos, movimentos e mapeamentos. |
| `POST` | `/api/stock/movements` | Registra movimento de estoque. |
| `POST` | `/api/stock/xml/preview` | Interpreta XML de NF-e sem importar. Corpo: `{"xml":"..."}`. |
| `POST` | `/api/stock/xml/import` | Importa uma NF-e previamente revisada. |

Uma chave de acesso de NF-e ja importada retorna `409`.

## Print-agent

Downloads e jobs exigem token do agente. O status/instalador admin exige
sessao.

| Metodo | Rota | Autenticacao | Descricao |
|---|---|---|---|
| `GET` | `/api/admin/print-agent/status` | Cookie | Estado apresentado no painel. |
| `GET` | `/api/admin/print-agent/installer.exe` | Cookie | Instalador Windows. |
| `GET` | `/api/admin/print-agent/installer.cmd` | Cookie | Alias legado do instalador. |
| `GET` | `/api/print-agent/download/windows-agent.mjs` | Token | Cliente Node legado. |
| `GET` | `/api/print-agent/download/windows-app.ps1` | Token | Script Windows legado. |
| `GET` | `/api/print-agent/jobs/stats` | Token | Contadores da fila. |
| `POST` | `/api/print-agent/jobs/claim` | Token | Reserva o proximo job. |
| `POST` | `/api/print-agent/jobs/:id/complete` | Token | Marca job como concluido. |
| `POST` | `/api/print-agent/jobs/:id/fail` | Token | Marca falha; aceita `error` ou `errorMessage`. |

Exemplo de autenticacao:

```bash
curl -H "Authorization: Bearer <token>" \
  https://softcore.cloud/api/print-agent/jobs/stats
```

## Seguranca verificada

- Sessao admin via cookie seguro.
- Rate limit em login e escritas publicas.
- Validacao de origem para pedidos/comprovantes.
- Cabecalhos `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer`.
- API publica remove campos fiscais.
- Consultas privadas retornam `401` sem sessao.
- IDs e corpos sao validados antes de alterar o banco.
- Arquivos estaticos usam lista publica fechada e aceitam apenas `GET/HEAD`.
- Codigo do servidor, testes, ferramentas, documentacao interna e backups
  retornam `403`.
- Comprovantes exigem assinatura temporaria valida ou sessao admin.
