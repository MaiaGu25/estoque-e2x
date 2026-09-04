import { useState } from "react";
import { Archive, LogIn } from "lucide-react";
import { api } from "./api";
import type { User } from "./types";

export default function Login({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>("/api/auth/login", { username, password });
      onLoggedIn(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
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
            <strong>ESTOQUE E2X</strong>
            <span>Controle inteligente</span>
          </div>
        </div>
        <label className="field">
          <span>Usuário</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="seu.usuario"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={loading || !username || !password}>
          <LogIn size={17} /> {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
