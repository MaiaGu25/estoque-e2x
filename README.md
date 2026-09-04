# Estoque E2X

Sistema de controle de estoque, ordens e movimentações da E2X. Roda inteiramente
na rede local da empresa — sem depender de nuvem ou internet no dia a dia.

## Stack

- **Backend:** Node.js + Express
- **Banco de dados:** SQLite local (`better-sqlite3`, modo WAL) — arquivo em `data/estoque.db`
- **Frontend:** React + TypeScript, empacotado com Vite
- **Autenticação:** login com usuário/senha (bcrypt), sessão por cookie assinado, papéis `admin` / `operador`

## Uso no dia a dia (Windows)

Veja `LEIA-ME_WINDOWS10.txt` para o passo a passo com os `.bat`.

## Desenvolvimento

```bash
npm install

# roda a API (porta 3000) e o servidor de desenvolvimento do Vite (porta 5173,
# com proxy de /api para a porta 3000) em dois terminais separados
npm run dev:server
npm run dev:client
```

Para rodar como em produção (o que os `.bat` fazem):

```bash
npm run build   # gera dist/client
npm start        # sobe o Express servindo API + frontend em :3000
```

Na primeira execução, o servidor cria `data/estoque.db`, roda as migrações e,
se o banco estiver vazio, importa o estoque real herdado da versão anterior
e cria as contas administrativas iniciais (as senhas temporárias aparecem no
terminal — cada pessoa deve trocá-las no primeiro login).

## Estrutura

```
server/   API Express, banco SQLite, autenticação, seed dos dados iniciais
client/   Frontend React/TypeScript (Vite)
data/     Banco SQLite local (gerado em runtime, fora do git)
```

## Backup

O banco inteiro é a pasta `data/`. `FAZER_BACKUP.bat` e
`RESTAURAR_ULTIMO_BACKUP.bat` copiam essa pasta para/de um SSD externo (E:).
