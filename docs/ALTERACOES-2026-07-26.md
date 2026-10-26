# Alteracoes e auditoria de 26/07/2026

## Resultado

Situacao final: operacional.

- Site e admin respondendo por HTTPS.
- `cardapio-api` e `Rikelmitunnel` online.
- Banco SQLite com `integrity_check = ok`.
- Nenhuma violacao de chave estrangeira.
- Nenhum banco inesperado restante na VPS.
- 45 testes automatizados aprovados.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas.
- API publica sem campos fiscais.
- APIs privadas retornando `401` sem sessao.

## Mudancas realizadas

### Busca

- Normalizacao de acentos, pontuacao, caixa e espacos.
- Inclusao de ingredientes, tamanho e categoria.
- Lupas clicaveis no cardapio e no admin.
- Sincronizacao das duas buscas do admin.

Validacoes com dados de producao:

| Consulta | Resultados |
|---|---:|
| `rucula` | 3 |
| `cream cheese` | 3 |
| `10 pedacos` | 18 |
| `pizzas especiais` | 15 |
| `tomate seco` | 3 |

### Pizza Rucula

- P (6 pedacos): `R$ 55`
- M (8 pedacos): `R$ 70`
- G (10 pedacos): `R$ 85`
- Tres imagens publicas verificadas.
- Ingredientes: M.M.O., rucula, bacon, tomate seco e cream cheese.

### Descricoes

- Todas as 48 pizzas ativas possuem ingredientes.
- Todas possuem descricao.
- As 48 descricoes sao diferentes, inclusive entre P, M e G.
- Caipira M conferida com ingredientes e descricao.

### Caixa

- Tabela confinada em box com scroll.
- Cabecalho fixo.
- Filtro `De/Ate`.
- Atalhos `Hoje` e `Todos`.
- Contador e coluna de data.
- Funcoes fiscais e de comanda comparadas com o backup: sem alteracao.

### Aplicativo e anuncio

- Manifesto e service worker publicados.
- Icones 192, 512 e Apple 180 publicados.
- Arte horizontal publicada.
- Anuncio ativo com acao `#instalar-app`.
- Prompt nativo em navegadores compativeis.
- Guia manual em iPhone/iPad e navegadores sem prompt.
- Somente o anuncio de instalacao e ocultado no app instalado.

## Banco e limpeza

Banco ativo:

```text
/var/lib/cardapio/data/cardapio.db
```

Contagens no momento da auditoria:

| Tabela | Linhas |
|---|---:|
| `app_state` | 10 |
| `cash_movements` | 10 |
| `cash_sessions` | 2 |
| `fiscal_documents` | 10 |
| `fiscal_events` | 30 |
| `order_logs` | 52 |
| `print_agent_heartbeats` | 1 |
| `print_jobs` | 44 |

Cinco diretorios antigos de teste continham dez bancos SQLite. Eles foram:

1. confirmados como fora do `DATA_DIR` de producao;
2. confirmados sem descritores de processo abertos;
3. compactados;
4. baixados para o computador;
5. validados por SHA-256;
6. removidos da VPS.

Arquivo local:

```text
backups-retirados-da-vps/morada-legacy-test-dbs-20260727.tar.gz
```

SHA-256:

```text
f36b776bb40bef1553606b1f9e7c57c47497fd6b80353430c094c8820d6e4da2
```

Depois da limpeza: 1 banco ativo, 22 backups oficiais, zero bancos
inesperados.

## Observacoes de infraestrutura

O log historico contem uma falha antiga de memoria do processo Node (PID
2738), anterior aos reinicios controlados desta manutencao. O processo atual:

- estava usando aproximadamente 100 MB de RAM;
- permaneceu estavel nas amostras;
- possui zero reinicios instaveis;
- tinha cerca de 230 MB de memoria disponivel e 955 MB de swap livre na VPS.

Nao foi observada falha de memoria no processo atual.

## Limitacao da auditoria

O navegador interativo nao estava disponivel. Por isso, nenhum documento
fiscal real foi emitido e o prompt nativo nao foi confirmado por clique.
Foram usados testes automatizados, simulacao das funcoes de filtro,
comparacao de hashes/blocos, verificacao HTTP publica, API, banco e logs.

