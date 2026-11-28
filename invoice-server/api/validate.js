// POST /validate: valida a assinatura EIP-712 (TransferWithAuthorization) feita pelo relógio.
// Funciona como função serverless na Vercel e pelo server.js local.
//
// Corpo (JSON):
//   publicKey    endereço (0x + 40 hex) ou chave pública secp256k1 (comprimida ou não)
//   transaction  a cobrança de /invoice, o typedData ou só a message
//   signature    0x + 130 hex (r‖s‖v) ou { r, s, v }
// Resposta 200: { ok, valid, checks, timeWindow, digest, recovered, expected }
// Resposta 400: { ok: false, error } para entrada malformada.
const { validateSignature, ValidationError } = require("../lib/validate.js");

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  // Na Vercel o corpo JSON já vem parseado em req.body.
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) reject(new ValidationError("corpo grande demais"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        reject(new ValidationError("corpo não é JSON válido"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed (use POST)" });
  }
  try {
    const body = await readBody(req);
    const result = await validateSignature(body);
    console.log("[validate] " + new Date().toISOString() + " " + JSON.stringify({ valid: result.valid, checks: result.checks, signer: result.recovered.address }));
    return sendJson(res, 200, result);
  } catch (e) {
    if (e instanceof ValidationError || e instanceof SyntaxError) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
    console.error("[validate] erro inesperado", e);
    return sendJson(res, 500, { ok: false, error: "erro interno" });
  }
};
