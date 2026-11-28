// Validação independente da assinatura EIP-712 feita pelo relógio.
//
// Usa o viem (não o código do relógio): se o relógio errar o hash, a codificação ABI, o RFC 6979
// ou o v, a validação falha. O domínio e os tipos usados no hash são SEMPRE os do servidor
// (lib/invoice.js); um domínio diferente na requisição é reportado e torna a assinatura inválida.
const {
  hashTypedData,
  recoverPublicKey,
  getAddress,
  isAddressEqual,
} = require("viem");
const { publicKeyToAddress } = require("viem/accounts");
const { DOMAIN, TYPES } = require("./invoice.js");

const PRIMARY_TYPE = "TransferWithAuthorization";
// Ordem do grupo secp256k1 (n) e n/2, para conferir "s baixo" (EIP-2).
const SECP256K1_N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
const HALF_N = SECP256K1_N / 2n;

class ValidationError extends Error {}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const UINT_RE = /^[0-9]+$/;

function fail(msg) {
  throw new ValidationError(msg);
}

/**
 * Chave pública aceita em três formatos:
 *  - endereço:           0x + 40 hex (o que o EIP-3009 usa em from/to)
 *  - chave não comprimida: 0x04 + 128 hex (ou 128 hex sem o 04)
 *  - chave comprimida:   0x02/0x03 + 64 hex
 */
function parsePublicKey(input) {
  const raw = String(input || "").trim();
  if (ADDRESS_RE.test(raw)) return { kind: "address", address: getAddress(raw) };
  const hex = raw.replace(/^0x/, "").toLowerCase();
  if (/^04[0-9a-f]{128}$/.test(hex)) return { kind: "uncompressed", publicKey: "0x" + hex };
  if (/^[0-9a-f]{128}$/.test(hex)) return { kind: "uncompressed", publicKey: "0x04" + hex };
  if (/^0[23][0-9a-f]{64}$/.test(hex)) return { kind: "compressed", publicKey: "0x" + hex };
  fail('"publicKey" inválido: esperado endereço (0x + 40 hex) ou chave pública secp256k1 (comprimida 0x02/0x03 + 64 hex, ou não comprimida 0x04 + 128 hex)');
}

function compress(uncompressed) {
  const hex = uncompressed.replace(/^0x04/, "");
  const x = hex.slice(0, 64);
  const yIsOdd = parseInt(hex.slice(-1), 16) % 2 === 1;
  return "0x" + (yIsOdd ? "03" : "02") + x;
}

/** Aceita "0x" + 130 hex (r‖s‖v) ou { r, s, v } (v = 27/28 ou 0/1). */
function parseSignature(input) {
  if (typeof input === "string") {
    const hex = input.trim();
    if (!/^0x[0-9a-fA-F]{130}$/.test(hex)) fail('"signature" inválida: esperado 0x + 130 hex (r‖s‖v)');
    return { r: "0x" + hex.slice(2, 66), s: "0x" + hex.slice(66, 130), v: parseInt(hex.slice(130), 16) };
  }
  if (input && typeof input === "object") {
    const r = String(input.r || "");
    const s = String(input.s || "");
    if (!BYTES32_RE.test(r) || !BYTES32_RE.test(s)) fail('"signature.r" e "signature.s" devem ser 0x + 64 hex');
    return { r, s, v: Number(input.v) };
  }
  fail('"signature" ausente');
}

/**
 * A transação pode vir como: a cobrança inteira ({ typedData }), o typedData
 * ({ domain, types, primaryType, message }) ou só a message ({ from, to, value, ... }).
 */
function parseTransaction(input) {
  if (!input || typeof input !== "object") fail('"transaction" ausente');
  const td = input.typedData || input;
  const message = td.message || td;
  const domain = td.domain || null;
  const primaryType = td.primaryType || PRIMARY_TYPE;
  if (primaryType !== PRIMARY_TYPE) fail(`primaryType "${primaryType}" não suportado (esperado ${PRIMARY_TYPE})`);

  for (const f of ["from", "to"]) if (!ADDRESS_RE.test(String(message[f]))) fail(`message.${f} inválido`);
  for (const f of ["value", "validAfter", "validBefore"]) {
    if (!UINT_RE.test(String(message[f]))) fail(`message.${f} inválido: esperado inteiro decimal`);
  }
  if (!BYTES32_RE.test(String(message.nonce))) fail("message.nonce inválido: esperado 0x + 64 hex");

  return {
    domain,
    message: {
      from: message.from,
      to: message.to,
      value: BigInt(message.value),
      validAfter: BigInt(message.validAfter),
      validBefore: BigInt(message.validBefore),
      nonce: message.nonce,
    },
  };
}

function domainMatches(domain) {
  if (!domain) return true; // sem domínio na requisição: usa o do servidor
  return (
    String(domain.name) === DOMAIN.name &&
    String(domain.version) === DOMAIN.version &&
    String(domain.chainId) === String(DOMAIN.chainId) &&
    String(domain.verifyingContract).toLowerCase() === DOMAIN.verifyingContract.toLowerCase()
  );
}

/**
 * @param {{ publicKey: string, transaction: object, signature: string|object }} body
 * @param {number} [nowSeconds]
 */
async function validateSignature(body, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!body || typeof body !== "object") fail("corpo JSON ausente");
  const expected = parsePublicKey(body.publicKey);
  const tx = parseTransaction(body.transaction);
  const sig = parseSignature(body.signature);
  if (![27, 28, 0, 1].includes(sig.v)) fail('"signature.v" inválido: esperado 27/28 (ou 0/1)');
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const signatureHex = sig.r + sig.s.slice(2) + v.toString(16);

  const digest = hashTypedData({ domain: DOMAIN, types: TYPES, primaryType: PRIMARY_TYPE, message: tx.message });

  let recoveredPublicKey;
  try {
    recoveredPublicKey = await recoverPublicKey({ hash: digest, signature: signatureHex });
  } catch (e) {
    fail("não foi possível recuperar a chave da assinatura: " + (e.shortMessage || e.message));
  }
  const recoveredAddress = publicKeyToAddress(recoveredPublicKey);

  let signatureMatchesPublicKey;
  let expectedAddress = null;
  if (expected.kind === "address") {
    expectedAddress = expected.address;
    signatureMatchesPublicKey = isAddressEqual(recoveredAddress, expected.address);
  } else if (expected.kind === "uncompressed") {
    expectedAddress = publicKeyToAddress(expected.publicKey);
    signatureMatchesPublicKey = recoveredPublicKey.toLowerCase() === expected.publicKey;
  } else {
    signatureMatchesPublicKey = compress(recoveredPublicKey) === expected.publicKey;
    if (signatureMatchesPublicKey) expectedAddress = recoveredAddress;
  }

  const checks = {
    // A assinatura foi feita pela chave informada?
    signatureMatchesPublicKey,
    // O contrato do USDC exige signatário == from (EIP-3009).
    fromMatchesSigner: isAddressEqual(recoveredAddress, tx.message.from),
    // Domínio da requisição (se veio) igual ao fixo do servidor.
    domainMatches: domainMatches(tx.domain),
    // EIP-2: s <= n/2 (o contrato do USDC recusa s alto).
    lowS: BigInt(sig.s) <= HALF_N,
  };
  const now = BigInt(nowSeconds);
  const timeWindow = {
    now: Number(now),
    validAfter: tx.message.validAfter.toString(),
    validBefore: tx.message.validBefore.toString(),
    // Informativo: não entra em "valid" (permite validar assinaturas antigas de teste).
    ok: now > tx.message.validAfter && now < tx.message.validBefore,
  };

  return {
    ok: true,
    valid: Object.values(checks).every(Boolean),
    checks,
    timeWindow,
    digest,
    recovered: { address: recoveredAddress, publicKey: recoveredPublicKey },
    expected: { format: expected.kind, address: expectedAddress },
  };
}

module.exports = { validateSignature, ValidationError };
