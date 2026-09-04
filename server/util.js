// Timestamp no mesmo formato "YYYY-MM-DD HH:MM:SS" usado pelos dados
// herdados da versão anterior, para que o frontend só precise entender um
// formato de data.
function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

module.exports = { nowStamp };
