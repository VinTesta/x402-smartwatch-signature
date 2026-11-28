// Servidor local. Na Vercel, as rotas vêm de api/ + vercel.json.
const http = require("node:http");
const invoice = require("./api/invoice.js");
const validate = require("./api/validate.js");

const PORT = Number(process.env.PORT) || 3000;

const routes = {
  "/invoice": invoice,
  "/validate": validate,
};

http
  .createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "");
    const handler = routes[path];
    if (handler) return handler(req, res);
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  })
  .listen(PORT, () => console.log("invoice-server em http://localhost:" + PORT));
