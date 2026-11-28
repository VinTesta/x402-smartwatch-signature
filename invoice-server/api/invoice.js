// GET /invoice: devolve o corpo da cobrança que o relógio vai assinar.
// Funciona como função serverless na Vercel e pelo server.js local.
//
// Query string (opcional, tem prioridade sobre as variáveis de ambiente):
//   ?from=0x...  endereço de quem paga (a carteira do relógio)
//   ?to=0x...    endereço de quem recebe
// No EIP-3009 "from" e "to" são ENDEREÇOS (20 bytes = últimos 20 bytes do keccak256 da chave
// pública), não a chave pública em si: é isso que entra no hash EIP-712.
// Um parâmetro presente mas inválido responde 400 (não cai silenciosamente no endereço zero).
//
// Variáveis de ambiente (opcionais):
//   PAYER_ADDRESS  "from" padrão
//   PAY_TO         "to" padrão
//   INVOICE_VALUE  valor em unidades mínimas de USDC (6 casas). Padrão: 10000 = 0.01 USDC
//   INVOICE_TTL    validade em segundos. Padrão: 300
const { buildInvoice, isAddress } = require("../lib/invoice.js");

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = (req, res) => {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const query = new URL(req.url, "http://localhost").searchParams;
  for (const name of ["from", "to"]) {
    if (query.has(name) && !isAddress(query.get(name))) {
      return sendJson(res, 400, {
        ok: false,
        error: `parâmetro "${name}" inválido: esperado endereço 0x + 40 hex`,
      });
    }
  }

  const invoice = buildInvoice({
    from: query.get("from") || process.env.PAYER_ADDRESS,
    payTo: query.get("to") || process.env.PAY_TO,
    value: process.env.INVOICE_VALUE,
    ttlSeconds: Number(process.env.INVOICE_TTL) || undefined,
  });

  console.log("[invoice] " + new Date().toISOString() + " " + JSON.stringify(invoice));
  sendJson(res, 200, invoice);
};
