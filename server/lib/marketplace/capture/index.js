// Ponto único de escolha do mecanismo de OCR (OrderCaptureReader). Hoje
// só existe o tesseract.js (offline, sem custo) - trocar de motor no
// futuro é só mudar esta linha.
module.exports = require("./TesseractCaptureReader");
