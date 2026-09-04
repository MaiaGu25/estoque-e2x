import { useState } from "react";
import { Archive, ShieldCheck } from "lucide-react";
import { api } from "./api";
import type { User } from "./types";

export default function ChangePassword({ onDone }: { onDone: (user: User) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("A nova senha precisa ter pelo menos 6 caracteres.");
    if (newPassword !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      onDone(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>PRIMEIRO ACESSO</strong>
            <span>Defina sua senha definitiva</span>
          </div>
        </div>
        <label className="field">
          <span>Senha temporária</span>
          <input
            type="password"
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Nova senha</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirmar nova senha</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={loading}>
          <ShieldCheck size={17} /> {loading ? "Salvando…" : "Salvar e continuar"}
        </button>
      </form>
    </div>
  );
}
