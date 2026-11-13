function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function redisCommand(command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Falha no armazenamento.");
  return response.json();
}

async function discordRequest(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok && response.status !== 204) {
    const detail = await response.text();
    throw new Error(`Discord API ${response.status}: ${detail}`);
  }
  return response;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  const event = req.body || {};
  const orderNsu = String(event.order_nsu || "");
  const transactionNsu = String(event.transaction_nsu || "");
  const slug = String(event.invoice_slug || event.slug || "");

  if (!orderNsu || !transactionNsu || !slug) {
    return json(res, 400, { error: "Dados de pagamento incompletos." });
  }

  try {
    const stored = await redisCommand(["GET", `order:${orderNsu}`]);
    const order = stored.result ? JSON.parse(stored.result) : null;
    if (!order) return json(res, 404, { error: "Pedido não encontrado." });
    if (order.status === "paid") return json(res, 200, { ok: true, message: "Pedido já processado." });

    const checkResponse = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: process.env.INFINITEPAY_HANDLE,
        order_nsu: orderNsu,
        transaction_nsu: transactionNsu,
        slug
      })
    });
    const check = await checkResponse.json().catch(() => ({}));

    if (!checkResponse.ok || check.paid !== true || Number(check.amount) !== Number(order.amount)) {
      console.warn("Pagamento não validado:", { orderNsu, status: checkResponse.status });
      return json(res, 200, { ok: true, verified: false });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const token = process.env.DISCORD_TOKEN;
    if (!guildId || !token) throw new Error("Configuração Discord incompleta.");

    const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!rolesResponse.ok) throw new Error("Não foi possível consultar cargos do Discord.");
    const roles = await rolesResponse.json();

    const generalRole = roles.find(role => role.name === "PRIVATE VIP");
    const planRole = roles.find(role => role.name === order.roleName);
    if (!generalRole || !planRole) throw new Error("Cargo PRIVATE VIP ou cargo do plano não encontrado.");

    const memberBase = `https://discord.com/api/v10/guilds/${guildId}/members/${order.discordUserId}/roles`;
    await discordRequest(`${memberBase}/${generalRole.id}`, "PUT");
    await discordRequest(`${memberBase}/${planRole.id}`, "PUT");

    order.status = "paid";
    order.transactionNsu = transactionNsu;
    order.paidAt = new Date().toISOString();
    await redisCommand(["SET", `order:${orderNsu}`, JSON.stringify(order), "EX", "31536000"]);

    return json(res, 200, { ok: true, verified: true, rolesAssigned: true });
  } catch (error) {
    console.error("Webhook processing error:", error.message);
    return json(res, 500, { error: "Erro ao processar a confirmação." });
  }
};