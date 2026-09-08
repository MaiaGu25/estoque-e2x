const { WebSocketServer } = require("ws");
const { COOKIE_NAME, parseCookieHeader, userFromToken } = require("./auth");

let wss = null;

// Liga o servidor de WebSocket no mesmo servidor HTTP do Express (mesma
// porta, sem precisar de configuração extra). Cada aba conectada recebe um
// aviso quando algo muda em um módulo, e a tela busca os dados de novo
// sozinha - sem precisar clicar em "Atualizar".
function init(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, req) => {
    const token = parseCookieHeader(req.headers.cookie, COOKIE_NAME);
    const user = userFromToken(token);
    if (!user) {
      socket.close(4001, "unauthorized");
      return;
    }
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  // Derruba conexões mortas (PC hibernou, cabo de rede caiu, etc.) para não
  // acumular sockets travados no servidor.
  const interval = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);

  wss.on("close", () => clearInterval(interval));
}

function broadcast(moduleName) {
  if (!wss) return;
  const payload = JSON.stringify({ module: moduleName });
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

module.exports = { init, broadcast };
