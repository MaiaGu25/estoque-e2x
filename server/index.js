const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const realtime = require("./realtime");

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
const tecnicosRoutes = require("./routes/tecnicos");
const testesRoutes = require("./routes/testes");
const rmaRoutes = require("./routes/rma");
const pecasFornecedorRoutes = require("./routes/pecasFornecedor");
const reservadosRoutes = require("./routes/reservados");
const logisticaRoutes = require("./routes/logistica");
const centralFotosRoutes = require("./routes/centralFotos");
const marketplaceRoutes = require("./routes/marketplace");
const marketplaceSyncJob = require("./jobs/marketplaceSync");

const app = express();
app.disable("x-powered-by");
// O build do Vite gera só um <script type="module"> e um <link rel="stylesheet">
// externos (sem inline nem CDN) - dá pra usar uma política restrita a
// 'self' sem quebrar nada. Fotos capturadas pelo navegador (Central de
// Fotos, RMA, Testes) usam data URL só na pré-visualização antes do envio,
// por isso img-src libera "data:" além de "self".
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(cookieParser());

// Limite geral por IP em toda a API, como segunda camada de defesa contra
// abuso/varredura automatizada - além do limite mais rígido só no login.
// O app não faz polling (as atualizações em tempo real vêm por WebSocket),
// então uso normal não chega perto desse número.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Aguarde um instante e tente novamente." },
  })
);

// A Central de Fotos define seus próprios limites de corpo por rota (o
// envio de fotos precisa de um limite bem maior que o resto da API) -
// por isso é montada antes do parser JSON genérico de 12mb logo abaixo,
// que senão consumiria a requisição primeiro com o limite menor.
app.use("/api/central-fotos", centralFotosRoutes);

// Limite maior por causa das fotos (base64) da Central de Testes.
app.use(express.json({ limit: "12mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/parts", partRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/tecnicos", tecnicosRoutes);
app.use("/api/testes", testesRoutes);
app.use("/api/rma", rmaRoutes);
app.use("/api/pecas-fornecedor", pecasFornecedorRoutes);
app.use("/api/reservados", reservadosRoutes);
app.use("/api/logistica", logisticaRoutes);
app.use("/api/marketplace", marketplaceRoutes);

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

// Por padrão o servidor fala HTTP simples, pensado pra rodar em rede local
// ou atrás de um proxy reverso (nginx/caddy) que termina o HTTPS - esse é
// o cenário recomendado em produção. Se TLS_CERT_PATH e TLS_KEY_PATH forem
// informados, o próprio processo já serve HTTPS diretamente, sem precisar
// de um proxy na frente (útil pra quando não existe um).
const TLS_CERT_PATH = process.env.TLS_CERT_PATH;
const TLS_KEY_PATH = process.env.TLS_KEY_PATH;
const usaHttps = Boolean(TLS_CERT_PATH && TLS_KEY_PATH);
const server = usaHttps
  ? require("https").createServer(
      { cert: fs.readFileSync(TLS_CERT_PATH), key: fs.readFileSync(TLS_KEY_PATH) },
      app
    )
  : http.createServer(app);
realtime.init(server);

const PORT = process.env.PORT || (usaHttps ? 443 : 3000);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Estoque E2X rodando em ${usaHttps ? "https" : "http"}://localhost:${PORT}`);
  marketplaceSyncJob.iniciar();
});
