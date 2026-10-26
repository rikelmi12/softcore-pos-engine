# Relatorio de seguranca — 26/07/2026

## Resultado executivo

Situacao final: vulnerabilidades de exposicao identificadas e corrigidas em
producao.

- Nenhuma credencial configurada foi encontrada nos arquivos publicos.
- Nenhum banco, certificado, dado fiscal, pedido ou dado de cliente ficou
  acessivel pela API publica.
- Backups do servidor, testes, ferramentas e arquivos tecnicos agora retornam
  `403`.
- Recursos estaticos aceitam somente `GET` e `HEAD`.
- Comprovantes exigem link assinado temporario ou sessao administrativa.
- O cache do admin nao conserva CSC, senha de certificado ou PIN.
- O banco permaneceu integro e os processos permaneceram online.

## Problemas encontrados e resolvidos

### Codigo interno exposto

Vinte caminhos tecnicos podiam ser baixados, incluindo:

- dois backups completos de `server.mjs`;
- `README.md` e `package-lock.json`;
- testes;
- ferramentas de migracao e impressao;
- modulos internos.

Foi aplicada uma lista publica fechada. Somente os arquivos necessarios ao
cardapio, painel, imagens, fontes e `lib/pizza-options.js` podem ser servidos.
Quatro backups de codigo foram movidos para fora da arvore publica.

### Metodos HTTP indevidos

O servidor entregava arquivos estaticos mesmo quando a requisicao usava
`POST`, `PUT`, `DELETE` ou `PATCH`. Agora esses metodos retornam `405` com:

```text
Allow: GET, HEAD
```

### Segredos no cache administrativo

A limpeza anterior removia o CSC legado e a senha do certificado, mas nao o
CSC dentro de `environments.producao`. A nova limpeza remove:

- CSC legado;
- CSC de homologacao e producao;
- senha do certificado;
- PIN do gerente;
- PINs temporarios de autorizacao.

Ao sair do painel, o cache fiscal e os campos sensiveis sao apagados, o estado
em memoria e redigido e a pagina e recarregada.

### Comprovantes Pix

Os nomes ja eram aleatorios e nao havia listagem publica, mas quem tivesse a
URL exata conseguia abrir a imagem. Agora:

- novos links possuem `expires` e assinatura HMAC;
- a validade padrao e 30 dias;
- assinatura alterada, ausente ou vencida retorna `401`;
- sessao admin valida continua permitindo acesso;
- o service worker nao intercepta nem armazena comprovantes;
- a troca da versao do cache remove o cache PWA anterior.

Nenhum comprovante foi apagado.

## Validacoes apos a publicacao

- 48 testes automatizados aprovados localmente.
- 48 testes automatizados aprovados na VPS.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas.
- Sintaxe de `server.mjs`, `admin.js`, `script.js` e service worker aprovada.
- Dez recursos publicos esperados retornaram `200`.
- Quatorze caminhos tecnicos testados retornaram `403`.
- `POST`, `PUT`, `DELETE` e `PATCH` em arquivo estatico retornaram `405`.
- `HEAD` em arquivo publico retornou `200` sem corpo.
- API publica apresentou zero chaves fiscais/sensiveis.
- API admin e API fiscal sem sessao retornaram `401`.
- Origem externa simulada retornou `403`.
- Comprovante sem assinatura retornou `401`.
- Comprovante com assinatura valida retornou `200`.
- Assinatura adulterada retornou `401`.
- Comprovante antigo com sessao admin retornou `200`.
- `PRAGMA integrity_check` retornou `ok`.
- `cardapio-api` e `Rikelmitunnel` permaneceram `online`.
- Vinte funcoes criticas de caixa, comanda e fiscal foram comparadas com o
  backup e permaneceram identicas.

Uma pasta antiga `tests/`, que continha expectativas obsoletas e procurava um
banco fora do `DATA_DIR`, foi arquivada fora da aplicacao. A suite oficial
sincronizada possui 48 testes.

## Backups de rollback na VPS

Os horarios abaixo usam UTC da VPS:

```text
/root/cardapio-code-backups/security-fix-20260727-012314
/root/cardapio-code-backups/public-source-removed-20260727-012314
/root/cardapio-code-backups/legacy-tests-20260727-012641
/root/cardapio-code-backups/test-suite-sync-20260727-012820
```

## Pontos de endurecimento ainda recomendados

Estes itens nao representam vazamento publico confirmado, mas devem ser
planejados:

- trocar a senha administrativa/SSH depois desta manutencao;
- configurar chave SSH e, depois de validar o acesso, desativar login do root
  por senha;
- reduzir gradualmente o uso de `'unsafe-inline'` na politica CSP.

O Fail2ban e o firewall estao ativos; a porta `8000` permanece bloqueada para
acesso externo.

## Limitacao

O controlador do Chrome nao estava disponivel nesta sessao. A auditoria foi
executada por requisicoes HTTP reais, sessao administrativa temporaria,
inspecao do codigo, testes de armazenamento simulados, API, SSH, banco,
firewall e processos. A sessao temporaria usada nos testes foi encerrada.
