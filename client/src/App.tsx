import { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./Login";
import ChangePassword from "./ChangePassword";
import StockApp from "./StockApp";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .get<{ user: User }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="loading">Carregando…</div>;

  if (!user) return <Login onLoggedIn={setUser} />;

  if (user.mustChangePassword) {
    return <ChangePassword onDone={setUser} />;
  }

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => {});
    setUser(null);
  };

  return <StockApp user={user} onLogout={logout} />;
}
