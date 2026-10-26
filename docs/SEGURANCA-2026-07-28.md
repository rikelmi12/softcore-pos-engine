# Relatório geral de segurança — 28/07/2026

## Status executivo

**Resultado: correções concluídas, verificadas localmente e publicadas em
produção.**

- Aplicação: Softcore Cloud / Morada da Pizza
- Site: `https://www.softcore.cloud/`
- VPS auditada: `127.0.0.1`
- Processo alterado: `cardapio-api`
- Processo de túnel preservado: `Rikelmitunnel`

O relatório externo `relatorio-seguranca-softcore-cloud.md` era uma análise
passiva e misturava hipóteses com constatações. A investigação confirmou uma
exposição de estrutura do painel antes do login, mas não confirmou acesso
público às APIs administrativas. A análise do código e dos bancos encontrou um
problema mais grave: senha do certificado, CSCs e PIN de gerente podiam ser
armazenados em texto puro e ser devolvidos a uma sessão administrativa.

Não foi encontrada evidência de invasão, extração pública de dados ou quebra de
autenticação. Isso não elimina a necessidade de trocar credenciais que tenham
sido compartilhadas fora de um gerenciador seguro.

## Resumo dos achados

| Achado | Situação anterior | Resultado |
| --- | --- | --- |
| HTML completo do painel antes do login | Confirmado | Corrigido |
| APIs administrativas públicas | Não confirmado; já retornavam `401` | Proteção mantida e retestada |
| Segredos fiscais em texto puro no SQLite | Confirmado | Criptografados ou transformados em hash |
| Resíduos antigos em páginas livres de backups SQLite | Confirmado na inspeção binária | Sanitizados com `secure_delete` e `VACUUM` |
| Segredos devolvidos ao navegador autenticado | Confirmado | Redigidos; somente indicadores booleanos são retornados |
| Upload com MIME declarado sem validar conteúdo | Confirmado | Assinatura binária de PNG, JPEG e WEBP obrigatória |
| Node exposto em todas as interfaces | Confirmado como defesa insuficiente | Restrito a `127.0.0.1:8000` |
| Vazamento fiscal na API pública | Não confirmado | API pública retestada sem campos sensíveis |
| Link previsível de comprovante Pix | Não confirmado | Assinatura HMAC e expiração preservadas |

## Correções implementadas

### Painel administrativo

- Uma requisição sem sessão para `/admin/` recebe somente uma página mínima de
  login, com aproximadamente 5 KB.
- O HTML completo, o JavaScript e o CSS administrativos exigem sessão válida.
- `/admin/admin.js`, `/api/admin/data` e `/api/data/fiscal` retornam `401` sem
  autenticação.
- A autorização continua aplicada no servidor; não depende apenas de ocultar
  elementos da interface.

### Segredos fiscais

- Senha do certificado e CSCs usam AES-256-GCM com IV aleatório e autenticação.
- O PIN de gerente usa `scrypt` com salt individual e não é reversível.
- A chave `DATA_ENCRYPTION_KEY` é independente da senha administrativa, foi
  gerada diretamente na VPS e não foi incluída no código, pacote ou relatório.
- Em produção, a aplicação não inicia se essa chave estiver ausente ou tiver
  menos de 32 caracteres.
- Uma chave incorreta causa falha explícita; os dados não são apagados nem
  substituídos silenciosamente.
- As APIs administrativas devolvem valores secretos vazios e indicadores como
  `certificatePasswordConfigured`, `cscConfigured` e
  `managerPinConfigured`.
- O painel preserva o segredo existente quando um campo redigido é salvo vazio.

### Migração e sanitização SQLite

- A migração protege automaticamente o banco ativo e todos os arquivos `.db`
  da pasta de backups.
- `PRAGMA secure_delete = ON`, checkpoint do WAL e `VACUUM` removem resíduos
  recuperáveis das páginas livres quando uma migração é necessária.
- A verificação de segurança cobriu o banco ativo e todos os backups existentes
  antes da redução de retenção. Após a limpeza solicitada, uma nova inspeção
  cobriu o banco ativo e os dois backups preservados:
  - 3 de 3 configurações fiscais protegidas;
  - zero formato lógico em texto puro;
  - zero ocorrência binária dos segredos reversíveis conhecidos;
  - zero erro de leitura ou descriptografia.
- A busca binária atesta o conteúdo atual dos arquivos. Como em qualquer
  armazenamento virtualizado/SSD, não é uma garantia de destruição física em
  blocos históricos do provedor.

### Comprovantes Pix

- Nomes aleatórios, links assinados com HMAC e expiração foram preservados.
- Link ausente, adulterado ou vencido continua retornando `401`.
- O service worker não intercepta nem armazena comprovantes, APIs ou o painel.
- O upload agora verifica os bytes reais de PNG, JPEG e WEBP; falsificar apenas
  a extensão ou o cabeçalho MIME não funciona.

### Rede, arquivos e cabeçalhos

- O Node escuta somente em `127.0.0.1:8000`.
- Nginx permanece como entrada pública nas portas 80 e 443.
- UFW está ativo, com 22/80/443 permitidas e 8000 explicitamente bloqueada.
- Fail2ban está ativo para SSH.
- `.env`, banco, backups, comprovantes e diretórios de certificados usam
  permissões restritas:
  - arquivos sensíveis: modo `600`;
  - diretórios sensíveis: modo `700`.
- O certificado `.pfx` na VPS permanece em diretório `700` e arquivo `600`.
- O certificado local também foi limitado ao usuário atual, SYSTEM e
  Administradores.
- O backend passou a emitir HSTS diretamente. A camada pública também entrega
  CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` e
  `Permissions-Policy`.

## Validações executadas

### Testes automatizados

- Local, antes da publicação: 48 de 48 aprovados.
- Cópia de staging na VPS: 48 de 48 aprovados.
- Diretório real de produção, após a publicação: 48 de 48 aprovados.
- Testes incluem produção real, migração do banco ativo e backups, remoção
  binária de resíduos, redação de APIs, preservação de segredos, hash do PIN,
  painel mínimo, upload válido/falso e links de comprovante.
- Verificação de sintaxe do servidor, painel, loja, service worker e testes:
  aprovada.
- `npm audit --omit=dev`, local, staging e produção: zero vulnerabilidades
  conhecidas.

### Banco de dados

`PRAGMA integrity_check` retornou `ok` antes e depois da implantação. As
contagens pré e pós-deploy são idênticas:

| Tabela | Antes | Depois |
| --- | ---: | ---: |
| `app_state` | 10 | 10 |
| `order_logs` | 54 | 54 |
| `cash_sessions` | 2 | 2 |
| `cash_movements` | 16 | 16 |
| `fiscal_documents` | 16 | 16 |
| `fiscal_events` | 30 | 30 |

### Sessão administrativa

Um teste autenticado com a configuração real, sem imprimir credenciais,
confirmou:

- login `200` e cookie de sessão emitido;
- painel completo e recursos administrativos `200` com sessão;
- dados administrativos e fiscais `200` com sessão;
- todos os campos secretos redigidos;
- indicadores de configuração presentes;
- logout executado ao final.

### Verificação pública final

- `/`: `200`, com CSP e HSTS
  `max-age=31536000; includeSubDomains`.
- `/admin/`: `200`, somente formulário mínimo de login.
- `/admin/admin.js`: `401` sem sessão.
- `/api/admin/data`: `401` sem sessão.
- `/api/data/fiscal`: `401` sem sessão.
- `/api/health`: `200`.
- `/api/data`: `200`, sem marcadores de senha de certificado, CSC ou PIN.
- `/server.mjs`: `403`.
- TLS 1.2 negociado com sucesso; TLS 1.1 recusado.

## Implantação e rollback

Aplicação em produção:

```text
/root/Teste cauan/cardapio/cardapio
```

Backup dos arquivos substituídos:

```text
/root/cardapio-code-backups/security-fix-20260728-1259
```

Backups SQLite preservados após a redução de retenção:

```text
/var/lib/cardapio/data/backups/cardapio-2026-07-28T13-07-14-628Z.db
/var/lib/cardapio/data/backups/cardapio-2026-07-28T16-06-56-403Z.db
```

Os dois backups SQLite estão íntegros, criptografados e sanitizados. Para
restaurá-los, é obrigatório manter a mesma `DATA_ENCRYPTION_KEY` e uma versão
do servidor que entenda o formato `enc:v1`. A retenção automática passou a
considerar todos os arquivos `.db` da pasta e conservar somente os dois mais
recentes.

O `cardapio-api` teve quatro reinicializações controladas durante migração,
sanitização, carregamento da versão final e ativação da retenção. Está `online`. O
`Rikelmitunnel` permaneceu `online`, com zero reinicializações.

## Arquivos alterados

- `server.mjs`
- `admin login/admin.js`
- `admin login/admin.html`
- `admin login/login.html`
- `ecosystem.config.cjs`
- `.env.example`
- `README.md`
- `test/storefront-server.test.mjs`
- `docs/OPERACAO.md`
- `docs/SEGURANCA-2026-07-28.md`

## Riscos residuais e recomendações

### Prioridade imediata

1. Trocar a senha do usuário `root`, pois ela foi compartilhada nesta conversa.
2. Cadastrar uma chave SSH administrativa e testá-la em uma segunda sessão.
3. Depois do teste da chave, desabilitar autenticação SSH por senha e login
   direto de `root` por senha. Essa mudança não foi feita automaticamente para
   evitar perda de acesso.

### Curto prazo

1. Guardar `DATA_ENCRYPTION_KEY` e credenciais somente em cofre de segredos, com
   cópia de recuperação controlada. Perder a chave impede restaurar os dados
   fiscais protegidos.
2. Criar backup externo criptografado e testar restauração periodicamente.
3. Remover gradualmente `'unsafe-inline'` da CSP por meio de nonces ou hashes.
4. Inicializar um repositório Git privado. A cópia local recebida não continha
   metadados Git; por isso o rollback atual é baseado em backups de arquivos.
5. Planejar atualização quando a API SQLite utilizada pelo Node deixar o estado
   experimental na versão adotada.

### Validação independente

Executar um pentest autorizado periódico, com janela de manutenção e escopo
formal. Esta revisão incluiu código, configuração, banco, autenticação, rede e
requisições reais, mas não realizou exploração destrutiva, engenharia social ou
teste de carga contra a produção.

## Conclusão

Os problemas confirmados foram corrigidos sem perda de registros e sem expor o
backend diretamente à internet. O painel público agora revela apenas o login,
os segredos fiscais estão protegidos no banco ativo e nos backups, resíduos
SQLite foram sanitizados e as verificações locais, de staging, autenticadas e
públicas foram aprovadas.
