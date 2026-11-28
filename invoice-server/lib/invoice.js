// Monta o corpo de uma cobrança: uma autorização EIP-3009 (TransferWithAuthorization)
// estruturada em EIP-712, no formato aceito por viem (signTypedData/verifyTypedData).
// Ainda sem x402: é só o corpo que o relógio vai assinar.
const crypto = require("node:crypto");

// USDC na Base Sepolia (o mesmo domínio que o relógio vai fixar no app).
const DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: 84532,
  verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

function pickAddress(value, fallback) {
  return isAddress(value) ? value : fallback;
}

/**
 * @param {object} opts
 * @param {string} [opts.from]  endereço do pagador (carteira do relógio)
 * @param {string} [opts.payTo] endereço que recebe
 * @param {string} [opts.value] valor em unidades mínimas (USDC tem 6 casas), string decimal
 * @param {number} [opts.ttlSeconds] janela de validade a partir de agora
 */
function buildInvoice(opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds || 300;
  const nonce = "0x" + crypto.randomBytes(32).toString("hex");

  // Números como string decimal: o relógio não tem BigInt.
  const message = {
    from: pickAddress(opts.from, ZERO_ADDRESS),
    to: pickAddress(opts.payTo, ZERO_ADDRESS),
    value: String(opts.value || "10000"), // 0.01 USDC
    validAfter: "0",
    validBefore: String(now + ttl),
    nonce,
  };

  return {
    invoiceId: nonce.slice(2, 18),
    description: "Cobrança de teste (assinatura EIP-712, sem x402)",
    createdAt: new Date(now * 1000).toISOString(),
    display: { symbol: "USDC", decimals: 6, network: "base-sepolia" },
    typedData: {
      domain: DOMAIN,
      types: TYPES,
      primaryType: "TransferWithAuthorization",
      message,
    },
  };
}

module.exports = { buildInvoice, isAddress, DOMAIN, TYPES };
