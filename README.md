# PRIVATE VIP — API de pagamentos

API serverless para criar links InfinitePay e liberar cargos Discord após validação do pagamento.

## Endpoints
- `POST /api/checkout` — chamado pelo bot Discord, autenticado com `Authorization: Bearer BOT_SHARED_SECRET`.
- `POST /api/webhook` — recebe a notificação da InfinitePay e valida o pagamento com `payment_check` antes de liberar cargos.

## Variáveis de ambiente na Vercel
Configure todas como Production (e Preview se desejar):

- `APP_URL`: URL pública do projeto, por exemplo `https://seu-projeto.vercel.app` (sem barra final).
- `BOT_SHARED_SECRET`: segredo aleatório longo compartilhado com o bot.
- `INFINITEPAY_API_KEY`: chave da API InfinitePay. Nunca coloque no GitHub.
- `INFINITEPAY_HANDLE`: `onlinestoreV`.
- `DISCORD_TOKEN`: token do bot Discord. Nunca coloque no GitHub.
- `DISCORD_GUILD_ID`: ID do servidor Discord.
- `UPSTASH_REDIS_REST_URL`: URL REST do banco Redis Upstash.
- `UPSTASH_REDIS_REST_TOKEN`: token REST do banco Upstash.

## Armazenamento
Crie um banco Redis gratuito no Upstash e configure a URL e o token REST. Os pedidos pendentes ficam armazenados por 48 horas.

## Planos configurados
- BASIC: R$ 9,90
- PLUS: R$ 24,90
- BLACK: R$ 39,90

Os valores ficam em centavos no arquivo `api/checkout.js`.

## Segurança e observações
- A notificação da InfinitePay não é tratada como prova de pagamento. O endpoint consulta `payment_check` antes de liberar cargos.
- A API procura os cargos `PRIVATE VIP`, `VIP BASIC`, `VIP PLUS` e `VIP BLACK` pelo nome.
- O cargo do bot precisa ter permissão Gerenciar Cargos e estar acima dos cargos VIP na hierarquia.
- O webhook é idempotente para pedidos já marcados como pagos.
- O endpoint ainda precisa ser integrado ao comando de compra do bot.
- Não execute um pagamento real para testar sem autorização. A InfinitePay não oferece sandbox para esse checkout.
- A hospedagem Vercel Hobby tem restrições de uso comercial; este repositório não altera os termos do plano.
