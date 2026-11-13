const PLANS = {
  basic: { name: "VIP BASIC", amount: 990, roleName: "VIP BASIC" },
  plus:  { name: "VIP PLUS",  amount: 2490, roleName: "VIP PLUS" },
  black: { name: "VIP BLACK", amount: 3990, roleName: "VIP BLACK" }
};

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  const secret = process.env.BOT_SHARED_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { error: "Não autorizado." });
  }

  const { discordUserId, plan } = req.body || {};
  const selected = PLANS[String(plan || "").toLowerCase()];
  if (!/^\d{17,20}$/.test(String(discordUserId || "")) || !selected) {
    return json(res, 400, { error: "Informe um Discord User ID válido e um plano válido." });
  }

  if (!process.env.INFINITEPAY_API_KEY || !process.env.INFINITEPAY_HANDLE ||
      !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return json(res, 500, { error: "Variáveis de ambiente incompletas." });
  }

  const orderNsu = `pv_${Date.now()}_${discordUserId}`;
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const payload = {
      handle: process.env.INFINITEPAY_HANDLE,
      order_nsu: orderNsu,
      webhook_url: `${process.env.APP_URL}/api/webhook`,
      redirect_url: `${process.env.APP_URL}/`,
      items: [{
        quantity: 1,
        price: selected.amount,
        description: `${selected.name} - PRIVATE VIP`
      }],
      options: {
        single_payment: true,
        valid_until: validUntil,
        payment_methods_enabled: ["credit_card", "pix"]
      }
    };

    const response = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.INFINITEPAY_API_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("InfinitePay link error:", response.status, data);
      return json(res, 502, { error: "A InfinitePay não conseguiu criar o checkout." });
    }

    const checkoutUrl = data.url || data.checkout_url || data.link;
    if (!checkoutUrl || typeof checkoutUrl !== "string") {
      console.error("Resposta inesperada da InfinitePay:", data);
      return json(res, 502, { error: "A InfinitePay retornou uma resposta sem link de checkout." });
    }

    const order = {
      orderNsu,
      discordUserId: String(discordUserId),
      plan: String(plan).toLowerCase(),
      amount: selected.amount,
      roleName: selected.roleName,
      checkoutUrl,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    const store = await redisCommand(["SET", `order:${orderNsu}`, JSON.stringify(order), "EX", "172800"]);
    if (store.error) throw new Error("Não foi possível salvar o pedido.");

    return json(res, 200, { checkoutUrl, orderNsu, plan: selected.name, amount: selected.amount });
  } catch (error) {
    console.error("Checkout error:", error.message);
    return json(res, 500, { error: "Erro interno ao preparar o pagamento." });
  }
};

async function redisCommand(command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Falha no armazenamento de pedidos.");
  return response.json();
}