# RevyStudy

Aplicativo de flashcards com repeticao espacada, feito com React, TypeScript e Supabase.

## Desenvolvimento local

1. Instale as dependencias com `npm install`.
2. Copie `.env.example` para `.env` e preencha as variaveis do Supabase.
3. Inicie o projeto com `npm run dev`.

## Variaveis de ambiente

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Essas mesmas variaveis devem ser configuradas no projeto da Vercel. Nunca envie o arquivo `.env` ao GitHub.

## Banco de dados

As migracoes SQL estao em `supabase/migrations` e devem ser aplicadas ao projeto do Supabase antes de usar a aplicacao em producao.

## Publicacao

O projeto esta preparado para Vercel. O arquivo `vercel.json` redireciona as rotas da aplicacao para o React Router.
