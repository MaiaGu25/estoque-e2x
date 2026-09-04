const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");

// node:sqlite ainda é experimental no Node.js e imprime um aviso ao ser
// carregado; suprime só esse aviso para não confundir quem só quer ver
// "Estoque E2X rodando em..." na janela preta.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning") console.warn(warning);
});

require("./db");
require("./seed/seed").seed();

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const partRoutes = require("./routes/parts");
const orderRoutes = require("./routes/orders");
const dataRoutes = require("./routes/data");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/parts", partRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/data", dataRoutes);

const clientDist = path.join(__dirname, "..", "dist", "client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res
      .status(503)
      .send("Frontend ainda não foi construído. Rode 'npm run build' antes de iniciar o sistema.");
  });
}

// Erros inesperados de rota não devem derrubar o servidor nem vazar detalhes internos.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Estoque E2X rodando em http://localhost:${PORT}`);
});
