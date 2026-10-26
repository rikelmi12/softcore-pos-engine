# Manual completo do sistema Cardápio / Softcore Cloud

Atualizado em 08/09/2026. Este documento descreve a arquitetura, os módulos,
os fluxos de negócio e a operação do sistema implementado neste diretório.
Detalhes de payloads e respostas estão em [API.md](API.md); procedimentos de
produção, backup e rollback estão em [OPERACAO.md](OPERACAO.md).

## 1. Visão geral

O sistema é uma aplicação web monolítica em Node.js. Um único processo entrega
as páginas estáticas, implementa as APIs HTTP e persiste o estado operacional
em SQLite. Ele atende quatro grupos de usuários e também publica três sites de
portfólio.

| Público | Entrada | Finalidade |
|---|---|---|
| Cliente | `/` | Consultar cardápio, montar carrinho, enviar pedido e comprovante Pix |
| Administrador | `/admin/` | Catálogo, pedidos, caixa, fiscal, estoque, equipe, suporte e assinatura |
| Garçom/gerente | `/garcom/` | Mesas, comandas, pedidos do salão, conta, transferência e impressão |
| Desenvolvedor | `/developer/` | Clientes gerenciados, assinaturas, suporte e auditoria |
| Visitante institucional | `/softtec/`, `/pharmativa/`, `/Mundonauticasma/` | Portfólios públicos independentes |

O domínio canônico de produção é `https://softcore.cloud`. Use sempre esse
host para operações internas e links profundos. O host `www` possui regras
próprias para algumas vitrines e não deve ser tratado como equivalente até que
o redirecionamento de todas as rotas esteja uniformizado.

## 2. Arquitetura

```text
Navegador / agente Windows
           |
        HTTPS
           |
        nginx
           |
  127.0.0.1:8000
           |
   Node.js server.mjs
    |       |       |
 páginas   regras   integrações
 estáticas negócio  SEFAZ/impressão
            |
          SQLite
 /var/lib/cardapio/data/cardapio.db
```

Componentes principais:

- `server.mjs`: servidor HTTP, roteamento, autenticação, banco, pedidos,
  estoque, caixa, fiscal, impressão, garçom, suporte e controle de clientes.
- `index.html`, `style.css`, `script.js`: loja pública e PWA.
- `admin login/`: login e painel administrativo.
- `garcom/`: interface de salão e módulos puros de estado/opções de pizza.
- `developer/`: painel central do desenvolvedor.
- `lib/`: regras de negócio reutilizáveis e conectores fiscais.
- `tools/CardapioPrintAgent/`: agente de impressão nativo para Windows.
- `tools/`: migrações auditáveis e cliente legado de impressão.
- `test/`: testes automatizados Node.
- `data/`: dados locais de desenvolvimento; em produção, o conteúdo mutável
  fica fora da release, no diretório definido por `DATA_DIR`.
- `softtec/`, `pharmativa/`, `Mundonauticasma/`: sites públicos estáticos.

Não fazem parte da aplicação ativa arquivos `.bak`, diretórios `bin/obj`,
snapshots com prefixo `pre-` e cópias aninhadas do projeto. Eles devem ser
tratados como artefatos históricos até uma limpeza controlada, nunca como
fonte para deploy.

## 3. Tecnologias e requisitos

- Node.js 22.5 ou superior, por causa de `node:sqlite`.
- SQLite como banco transacional local ao servidor.
- HTML, CSS e JavaScript sem framework para loja, admin, garçom e Developer.
- .NET para compilar e testar o agente Windows.
- nginx e `cardapio.service` em produção.
- Certificado A1/PFX e serviços SOAP da SEFAZ para emissão fiscal, quando
  configurados.

Dependências Node relevantes:

- `@xmldom/xmldom`, `xml-crypto` e `node-forge`: XML, assinatura e certificado
  fiscal;
- `qrcode`: QR Code fiscal;
- `puppeteer`: testes e automações de navegador.

## 4. Módulos funcionais

### 4.1 Loja pública e PWA

A loja carrega o estado público por `/api/data`, exibe categorias, produtos,
combos, promoções, anúncios, horários e identidade visual. A busca normaliza
acentos, caixa, pontuação e espaços e consulta nome, descrição, ingredientes,
tamanho, categoria e outros campos de catálogo.

O cliente monta o carrinho, escolhe entrega/retirada, endereço e pagamento. O
checkout registra uma pendência no servidor e abre a conversa do WhatsApp com
o código `WEB-XXXXXXXX`. O pedido ainda não é uma venda confirmada nesse ponto.

A PWA usa `manifest.json` e `service-worker.js`. O service worker segue a
estratégia rede primeiro para o conteúdo público e não armazena APIs, painel
administrativo ou comprovantes.

### 4.2 Catálogo e aparência

O administrador gerencia:

- produtos, preços, tamanhos, imagens, ingredientes e campos fiscais;
- categorias, bordas, combos e promoções;
- anúncios e a ação especial `#instalar-app`;
- nome, logo, banner, endereço, contatos e horários;
- cores, textos da home, seções visíveis e informações de entrega;
- status da loja, valor mínimo, taxas e bairros atendidos.

Imagens novas do catálogo são validadas e armazenadas como arquivos imutáveis
em `assets/catalog/`, identificados pelo hash do conteúdo. Dados fiscais nunca
fazem parte das respostas públicas.

### 4.3 Pedidos públicos

Fluxo normal:

1. O cliente envia o pedido.
2. O servidor valida origem, limites, catálogo, preços, total, loja aberta e
   regras de entrega/retirada.
3. O registro entra em `order_logs` com estado `pending` e código público.
4. O operador compara o código com a conversa recebida no WhatsApp.
5. O operador confirma ou rejeita a pendência.
6. Somente na confirmação o servidor aceita o pedido, aplica o estoque e cria
   o trabalho inicial de impressão, tudo na mesma transação.

Enquanto estiver pendente, o pedido não altera estoque, caixa, fiscal,
comandas ou impressão. Reenvios idempotentes não duplicam a operação. Há TTL e
limites persistentes por cliente e para a fila global.

### 4.4 Garçom, mesas e comandas

O painel `/garcom/` possui sessão própria e dois papéis: `waiter` e `manager`.
O administrador cadastra, altera, ativa ou desativa funcionários no módulo
Equipe do Salão.

O fluxo de salão permite:

- visualizar o painel e as mesas;
- criar mesas adicionais;
- abrir comanda em uma mesa;
- adicionar pedidos e itens à comanda;
- remover item conforme as regras de autorização;
- reimprimir um pedido com limite de frequência;
- imprimir a conta;
- solicitar/fechar a conta e enviá-la para o caixa;
- reabrir, transferir, vincular e desvincular mesas;
- consultar uma comanda específica.

Uma conta encerrada no salão continua registrada e deve aparecer no fluxo do
caixa. Fechar mesa não significa apagar pedido nem pular o recebimento.
Operações são auditadas e aceitam IDs de requisição para evitar repetições.

### 4.5 Caixa

O caixa organiza sessões e movimentos financeiros:

- abertura com saldo inicial;
- recebimento de pedido por forma de pagamento;
- suprimento, sangria, ajuste e outros movimentos manuais válidos;
- estorno de recebimento;
- fechamento e histórico de sessões;
- resumo de totais, movimentos e documentos recentes.

O painel mostra pedidos confirmados ainda não recebidos, inclusive comandas
encerradas pelo garçom. Recebimento e estorno preservam vínculos de auditoria.
Quando o bloqueio de operador está ativo, ações sensíveis podem exigir PIN
gerencial.

### 4.6 Fiscal e SEFAZ

O módulo fiscal mantém configuração de emitente, endereço, ambiente,
numeração, tributação, certificado A1, CSC, permissões, contingência e eventos.
Ele suporta pré-validação, criação de rascunho, transmissão, cancelamento e
inutilização de numeração para NF-e/NFC-e de acordo com a configuração.

Arquivos em `lib/fiscal-core.mjs`, `lib/sefaz-connectors.mjs` e
`lib/sefaz-protocol-core.mjs` concentram cálculo, XML, assinatura e protocolo.
A senha do certificado e os CSCs são criptografados; o PIN gerencial é
armazenado como hash. As APIs retornam apenas indicadores de que esses segredos
estão configurados.

Nunca transmita, cancele ou inutilize documento em produção apenas para testar
a tela: essas ações podem ter efeito fiscal real.

### 4.7 Estoque

O estoque mantém saldo, custo médio e histórico por produto. Entradas e saídas
podem vir de contagem inicial, movimento manual, venda confirmada, exclusão
permitida ou importação de NF-e.

O XML de NF-e passa primeiro por `preview`; depois da conferência, `import`
registra a entrada. A chave de acesso impede importar a mesma nota novamente.
Mapeamentos ligam itens do fornecedor aos produtos internos. IDs de requisição
protegem mutações contra duplicidade.

### 4.8 Impressão

Há dois modos:

1. impressão silenciosa local pelo servidor, apenas em Windows/WSL compatível;
2. fila `print_jobs` consumida pelo agente Windows instalado no computador da
   impressora.

No modo recomendado, o painel gera um instalador com código de ativação de uso
único. O agente troca esse código por uma credencial individual, protegida por
DPAPI no Windows. Seu ciclo é `claim` → imprimir → `complete`; em erro, chama
`fail`.

O heartbeat comprova conexão com o servidor, mas não confirma papel, tampa,
driver ou capacidade física da impressora. Jobs pendentes antigos são
descartados pelo limite configurado para impedir impressão tardia e acúmulo de
fila. O token global legado deve permanecer desabilitado depois que todos os
computadores necessários estiverem usando credenciais individuais.

### 4.9 Suporte e assinatura

No painel administrativo, o cliente pode consultar, abrir e responder
chamados. No painel Developer, a equipe visualiza todos os chamados, responde,
altera categoria/estado e pode editar ou excluir apenas mensagens próprias.

O módulo Financeiro mostra plano, situação e vencimento da assinatura. A
instância pode obter esses dados de configuração local ou sincronizá-los com o
plano de controle usando um identificador e token de cliente. Suspensão é
aplicada no servidor, não somente escondida na interface.

### 4.10 Painel Developer e clientes gerenciados

O painel Developer é independente do admin da loja. Exige usuário, senha com
hash scrypt, TOTP e sessão própria. Escritas usam `X-Developer-CSRF`.

Ele permite cadastrar e atualizar clientes gerenciados, emitir/rotacionar
tokens de controle, acompanhar assinatura, atender suporte e consultar eventos
de auditoria em memória. Tokens são exibidos somente quando criados ou
rotacionados e devem ser guardados em cofre seguro.

### 4.11 Sites institucionais

- `softtec/`: portfólio SoftTec com cenas WebGL/3D e mídia local;
- `pharmativa/`: site institucional responsivo com galeria local;
- `Mundonauticasma/`: vitrine da loja náutica;
- `privacy.html` e `security.html`: páginas públicas de privacidade e
  segurança.

Cada diretório tem allowlist própria no servidor. Adicionar um arquivo à pasta
não o torna público automaticamente; a extensão e o caminho precisam estar
permitidos em `server.mjs`.

## 5. Modelo de dados

O SQLite usa chaves estrangeiras e transações para operações relacionadas. As
tabelas estão agrupadas abaixo por responsabilidade.

| Grupo | Tabelas | Responsabilidade |
|---|---|---|
| Configuração | `app_state`, `admin_account` | Seções do sistema e credencial administrativa |
| Pedidos | `order_logs`, `order_receipt_uploads` | Pendências, pedidos confirmados e comprovantes |
| Estoque | `stock_balances`, `stock_movements`, `stock_xml_imports`, `stock_supplier_mappings`, `stock_mutation_requests` | Saldos, custos, NF-e e idempotência |
| Impressão | `print_jobs`, `print_agent_heartbeats`, `print_agent_enrollments`, `print_agent_credentials` | Fila, ativação, credenciais e presença dos agentes |
| Salão | `waiter_users`, `waiter_sessions`, `waiter_audit_events`, `waiter_mutation_requests`, `dining_tables`, `table_tabs`, `table_tab_orders`, `table_tab_members` | Usuários, sessões, mesas e comandas |
| Caixa | `cash_sessions`, `cash_movements` | Turnos e lançamentos financeiros |
| Fiscal | `fiscal_documents`, `fiscal_events` | Documentos e eventos SEFAZ |
| Suporte/controle | `support_tickets`, `support_messages`, `managed_clients` | Atendimento e clientes gerenciados |

As seções armazenadas em `app_state` são `config`, `visual`, `categories`,
`products`, `combos`, `promotions`, `announcements`, `orders`, `borders` e
`fiscal`. A seção `fiscal` é privada.

Arquivos mutáveis associados:

- `cardapio.db`: banco principal;
- `backups/*.db`: backups SQLite consistentes;
- `order-receipts/`: comprovantes enviados;
- `default-data.json`: estado inicial usado quando necessário;
- `print-agent-token.txt`: token legado gerado, se essa compatibilidade estiver
  ativa.

## 6. Autenticação e autorização

| Contexto | Credencial | Proteção de escrita |
|---|---|---|
| Loja pública | Sem login | validação de origem, rate limit, tamanho e regras de negócio |
| Admin | cookie `bf_admin_session` | `X-Admin-CSRF` em POST/PUT/PATCH/DELETE |
| Garçom | cookie `bf_waiter_session` | sessão, papel, origem e idempotência |
| Developer | cookie `bf_developer_session` | TOTP no login e `X-Developer-CSRF` nas escritas |
| Print-agent | Bearer individual | credencial revogável e identificação do computador |
| Plano de controle | ID + Bearer token | cliente ativo e token válido |

Cookies de sessão são `HttpOnly` e `SameSite=Strict`; em HTTPS também recebem
`Secure`. Senhas administrativas e de garçom usam hash scrypt. Tentativas de
login e outras rotas sensíveis têm bloqueio temporário.

O servidor expõe somente arquivos estáticos allowlisted. Código do backend,
testes, ferramentas, documentação, banco, `.env`, certificados e backups devem
responder `403` pela camada da aplicação e permanecer fora de qualquer raiz
pública do nginx.

## 7. Configuração por ambiente

Crie `.env` a partir de `.env.example`; nunca versione o arquivo real. As
variáveis se dividem em:

- núcleo: `NODE_ENV`, `PORT`, `PUBLIC_HOST`, `DATA_DIR`;
- admin e criptografia: `ADMIN_USER`, `ADMIN_PASSWORD` apenas no bootstrap,
  `DATA_ENCRYPTION_KEY`, `ORDER_RECEIPT_LINK_SECRET`, TTL de sessão;
- origens/proxy: `CORS_ORIGINS`, `TRUST_PROXY`, `ALLOW_NULL_ORIGIN` e flags de
  exigência de origem;
- banco/backup: `DB_SYNC_MODE`, `DB_BACKUP_KEEP_FILES`;
- limites: login, pedidos, comprovantes, imagens, XML e corpos HTTP;
- fiscal: timeouts SEFAZ, fuso e largura do comprovante;
- impressão: flags, impressora, timeouts, fila, ativação e URL pública;
- garçom: quantidade inicial de mesas, TTLs, limites e proteção de escrita;
- assinatura/controle: plano local, checkout, `CONTROL_PLANE_URL`, ID e token;
- Developer: usuário, hash de senha, segredo TOTP e TTL da sessão.

Em produção são obrigatórios valores fortes e independentes para
`DATA_ENCRYPTION_KEY` e `ORDER_RECEIPT_LINK_SECRET`. A conta admin é criada no
primeiro início com `ADMIN_PASSWORD`; depois, remova a variável, pois a senha
ativa já estará armazenada apenas como hash no banco.

## 8. Desenvolvimento local

No diretório do projeto:

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Antes de iniciar, ajuste o `.env` local. Não reutilize credenciais de produção.
URLs padrão:

- loja: `http://localhost:8000/`;
- admin: `http://localhost:8000/admin/`;
- garçom: `http://localhost:8000/garcom/`;
- Developer: `http://localhost:8000/developer/`;
- saúde: `http://localhost:8000/api/health`.

O servidor de desenvolvimento pode gerar uma senha admin temporária quando não
há bootstrap configurado. Isso não é permitido como estratégia de produção.

## 9. Testes e validação

Verificação mínima antes de publicar:

```powershell
npm test
npm audit --omit=dev
node --check server.mjs
node --check script.js
node --check "admin login/admin.js"
node --check garcom/garcom.js
node --check developer/developer.js
```

Agente Windows:

```powershell
dotnet run --project tools/CardapioPrintAgent.Tests/CardapioPrintAgent.Tests.csproj
dotnet publish tools/CardapioPrintAgent/CardapioPrintAgent.csproj -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true -o tools/dist/print-agent-windows
```

Além dos testes automatizados, valide em navegador desktop e mobile: primeiro
acesso, busca, produto, carrinho, login admin, login garçom e as vitrines.
Testes de saúde não substituem fluxo autenticado nem impressão física.

## 10. Produção e releases

A topologia confirmada em 08/09/2026 é:

- unidade: `cardapio.service`;
- link da versão ativa: `/srv/cardapio/current`;
- releases imutáveis: `/srv/cardapio/releases/<identificador>`;
- dados persistentes: `/var/lib/cardapio/data`;
- banco: `/var/lib/cardapio/data/cardapio.db`;
- entrada pública: nginx em 80/443;
- Node: somente `127.0.0.1:8000`.

Sempre descubra a release ativa em vez de presumir um caminho:

```bash
systemctl status cardapio.service --no-pager
readlink -f /srv/cardapio/current
pid=$(systemctl show -p MainPID --value cardapio.service)
readlink -f "/proc/$pid/cwd"
curl -fsS http://127.0.0.1:8000/api/health
```

Publicação segura, em alto nível:

1. validar a origem local e o conjunto exato de arquivos;
2. criar uma nova pasta em `/srv/cardapio/releases/`;
3. instalar dependências e executar testes nessa pasta sem apontar para o banco
   de produção;
4. garantir que dados, `.env`, mídia mutável, certificados e backups continuem
   fora da release;
5. trocar `/srv/cardapio/current` atomicamente para a nova versão;
6. reiniciar `cardapio.service` apenas após a troca;
7. verificar PID/cwd, healthcheck, logs, banco e URLs públicas;
8. manter a release anterior até o período de observação terminar.

Copiar arquivos para um diretório antigo em `/root` não atualiza o serviço
atual. Não sobrescreva a release ativa arquivo por arquivo.

## 11. Backup, restauração e rollback

Nunca copie apenas `cardapio.db` enquanto houver WAL ativo. Use a API de backup
do SQLite ou uma ferramenta que produza snapshot consistente.

Antes de mudança de código ou dados:

1. confirme `DATA_DIR` e o banco realmente aberto pelo processo;
2. execute `PRAGMA quick_check` e `PRAGMA foreign_key_check`;
3. gere backup consistente e registre data, tamanho e hash;
4. preserve `.env`, chaves e certificado necessários à restauração;
5. teste a leitura do backup.

Restauração de banco exige janela de manutenção. Pare o serviço, preserve o
estado atual, restaure a cópia validada com permissões corretas, inicie o
serviço e confira integridade e fluxos. A mesma `DATA_ENCRYPTION_KEY` usada no
backup é necessária para ler segredos fiscais criptografados.

Rollback de código normalmente consiste em apontar `current` para a release
anterior validada, reiniciar e repetir healthcheck/logs. Não altere nem remova o
diretório de dados durante rollback de código.

## 12. Monitoramento diário

Checklist operacional:

```bash
systemctl is-active cardapio.service
systemctl status cardapio.service --no-pager
journalctl -u cardapio.service -n 100 --no-pager
curl -fsS https://softcore.cloud/api/health
readlink -f /srv/cardapio/current
sqlite3 /var/lib/cardapio/data/cardapio.db "PRAGMA quick_check;"
sqlite3 /var/lib/cardapio/data/cardapio.db "PRAGMA foreign_key_check;"
```

Também acompanhe espaço em disco, memória, validade do certificado TLS,
resultado do backup diário, tamanho da fila de impressão, credenciais sem
heartbeat e erros SEFAZ. Nunca imprima valores de `.env` em relatórios.

## 13. Solução de problemas

### Alteração publicada não aparece

- confira `readlink -f /srv/cardapio/current` e `/proc/<PID>/cwd`;
- confirme que o arquivo foi para a release ativa;
- verifique cache do navegador/service worker;
- compare hash local e remoto;
- não presuma que uma cópia em `/root` esteja sendo executada.

### Rota retorna 403

Arquivos estáticos usam allowlist. Confirme se a rota é deliberadamente
pública e atualize a allowlist correspondente. Nunca libere uma pasta inteira
para corrigir um único arquivo.

### Funciona em `softcore.cloud`, mas não em `www`

Use o host canônico. O roteamento de `www` ainda não cobre todas as rotas
profundas; isso é um problema de nginx/hostname, não de sessão do navegador.

### Pedido não chegou ao caixa

Verifique o estado do pedido/comanda, se a pendência pública foi confirmada e
se a conta do salão foi encerrada. Heartbeat do agente de impressão não tem
relação com a presença do pedido no caixa.

### Agente online, mas não imprime

Confira fila, credencial individual, nome da impressora, driver, spooler,
papel, tampa e log local. Heartbeat indica somente comunicação. Não reative
repetições automáticas indiscriminadas, pois isso pode duplicar comandas.

### Imprime pedidos antigos ao reconectar

Confirme `PRINT_AGENT_MAX_PENDING_AGE_MS`. Jobs fora da idade aceitável devem
ser descartados; pedidos e registros financeiros permanecem preservados.

### Login retorna “Falha na operação”

Abra a rota no host canônico e inspecione o tipo da resposta da API. HTML/403
recebido onde o cliente espera JSON normalmente indica roteamento de nginx ou
hostname incorreto, não senha necessariamente inválida.

### Imagens de uma vitrine não carregam

Prefira mídia local otimizada. URLs externas podem falhar por hotlink, CORS ou
ORB. Confirme no painel de rede e sirva WebP/AVIF pela allowlist da própria
vitrine.

## 14. Migrações

As migrações em `tools/` são específicas, idempotentes e oferecem modo
`--dry-run` quando indicado. Procedimento:

1. leia o script e confirme o banco alvo;
2. execute o dry-run;
3. gere e valide backup consistente;
4. pare o serviço se o script exigir acesso exclusivo;
5. aplique uma única vez;
6. execute novamente o dry-run e os testes de integridade;
7. inicie o serviço e valide os fluxos afetados.

Nunca copie o banco local para produção para “levar” alterações de catálogo.

## 15. Estado conhecido em 08/09/2026

Na auditoria geral mais recente, o serviço, banco, backups, autenticação e
testes estavam saudáveis. Os pontos ainda abertos estão documentados em
[AUDITORIA-GERAL-2026-09-08.md](../audit-reports/2026-09-08/AUDITORIA-GERAL-2026-09-08.md):

- sobreposição do anúncio e privacidade no primeiro acesso móvel;
- imagens externas quebradas na Mundo Náutica;
- rotas profundas incompletas no host `www`;
- tarefa longa no carregamento da SoftTec e contraste baixo no link Terra 3D;
- compatibilidade de token legado do print-agent ainda ativa;
- busca pública sem nome acessível.

Esse bloco é um retrato datado, não uma descrição permanente. Ao corrigir um
item, atualize o relatório ou registre uma nova auditoria com evidência.

## 16. Regras para manutenção

- preservar pedidos, caixa, fiscal, estoque, comprovantes e dados de clientes;
- alterar somente o módulo solicitado;
- proteger toda escrita autenticada com o CSRF correto;
- usar transações para efeitos relacionados e idempotência em reenvios;
- adicionar teste de regressão para cada bug corrigido;
- validar interface em desktop e mobile quando houver mudança visual;
- não confundir compilação, healthcheck ou heartbeat com validação ponta a
  ponta;
- nunca registrar senha, cookie, token, chave, CSC, PIN ou certificado;
- manter release e dados em diretórios separados;
- documentar migração, impacto, validação e rollback de cada publicação.

## 17. Índice da documentação

- [API.md](API.md): rotas, autenticação e contratos HTTP.
- [OPERACAO.md](OPERACAO.md): runbook resumido de produção.
- [SEGURANCA-2026-07-28.md](SEGURANCA-2026-07-28.md): endurecimento e migração
  de segredos.
- [SEGURANCA-2026-07-26.md](SEGURANCA-2026-07-26.md): auditoria histórica.
- [ALTERACOES-2026-07-26.md](ALTERACOES-2026-07-26.md): alterações históricas.
- [Auditoria de 08/09/2026](../audit-reports/2026-09-08/AUDITORIA-GERAL-2026-09-08.md):
  estado técnico e pendências atuais.

