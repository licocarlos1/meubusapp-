# Deploy do MeuBusApp na VPS (Portainer + Traefik)

> Tudo roda na mesma VPS (`78.142.242.66`): app (frontend + API) num container,
> e o PostgreSQL no container `postgres` que já existe (rede `sevenbotsnetwork`).
> O Traefik cuida do HTTPS automático. A porta 5432 fica FECHADA (conexão interna).

---

## Passo 1 — DNS (no registro.br)

No painel do registro.br, na zona DNS de `meubusapp.com.br`, crie:

| Tipo | Nome | Valor |
|------|------|-------|
| A    | @ (ou meubusapp.com.br) | `78.142.242.66` |
| A    | www  | `78.142.242.66` |

Aguarde a propagação (minutos a poucas horas).

---

## Passo 2 — Criar o banco "setebus" e aplicar o schema

A Evolution usa um banco próprio (`evolution`); vamos fazer igual com `setebus`.

No terminal da VPS (ou no console do container postgres pelo Portainer):

```bash
# descubra o container do postgres
docker ps | grep postgres

# crie o banco dedicado
docker exec -it <CONTAINER_POSTGRES> psql -U postgres -c "CREATE DATABASE setebus;"

# aplique o schema completo (todas as tabelas + funções RPC)
cat schema_completo.sql | docker exec -i <CONTAINER_POSTGRES> psql -U postgres -d setebus -v ON_ERROR_STOP=1
```

> O `schema_completo.sql` já foi testado contra PostgreSQL 14 (mesma versão da VPS).

---

## Passo 3 — Subir o código e construir a imagem

Leve o projeto para a VPS (git clone ou upload). Na pasta do projeto:

```bash
docker build -t setebus-api:latest .
```

Isso builda o frontend (Vite) e empacota o servidor Express numa imagem só.
Num swarm de 1 nó, a imagem fica disponível localmente para a stack.

---

## Passo 4 — Deploy da stack no Portainer

1. **Portainer → Stacks → Add stack**
2. Nome: `setebus`
3. Cole o conteúdo de `stack-setebus.yml`
4. **ANTES de deploy**, troque na própria tela:
   - `DB_PASSWORD` → a senha do seu Postgres
   - `JWT_SECRET` → uma string aleatória longa (ex: rode `openssl rand -base64 48`)
   - `ADMIN_PASSWORD` → a senha que você quer pro painel `/admin`
5. Crie o volume externo uma vez (terminal da VPS):
   ```bash
   docker volume create setebus_uploads
   ```
6. Clique em **Deploy the stack**.

Acompanhe os logs em **Portainer → Containers → setebus_api → Logs**.
Deve aparecer: `🚌 MeuBusApp Server rodando na porta 3001`.

---

## Passo 5 — Acessar

Abra **https://meubusapp.com.br**. O Traefik emite o certificado SSL
automaticamente no primeiro acesso (pode levar alguns segundos).

- App: `https://meubusapp.com.br`
- Admin: `https://meubusapp.com.br/admin`
  - E-mail: `licocarlos@gmail.com`
  - Senha: a que você definiu em `ADMIN_PASSWORD`

---

## Notas

- **Frontend e API na mesma origem**: o Express serve o `dist/` e responde
  `/api/*`. Não precisa configurar `VITE_API_URL` (fica vazio = mesma origem).
- **Uploads de anúncios**: funcionam normalmente (vão pro volume `setebus_uploads`).
- **Atualizar o app no futuro**: rebuild da imagem (`docker build -t setebus-api:latest .`)
  e no Portainer → Stacks → setebus → **Update** (ou force recreate do serviço).
- **Banco**: compartilha o mesmo servidor Postgres das outras stacks, mas num
  banco isolado (`setebus`) — não interfere no `evolution`, `chatwoot`, etc.
