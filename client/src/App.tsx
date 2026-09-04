import { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./Login";
import ChangePassword from "./ChangePassword";
import Hub from "./Hub";
import StockApp from "./StockApp";
import TecnicosApp from "./TecnicosApp";
import TestesApp from "./TestesApp";
import type { User } from "./types";

type AppId = "estoque" | "tecnicos" | "testes";
const VALID: AppId[] = ["estoque", "tecnicos", "testes"];

function readHash(): AppId | null {
  const id = window.location.hash.replace("#/", "");
  return (VALID as string[]).includes(id) ? (id as AppId) : null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState<AppId | null>(readHash());

  useEffect(() => {
    api
      .get<{ user: User }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onHashChange = () => setActive(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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

  const open = (id: AppId) => {
    window.location.hash = `#/${id}`;
    setActive(id);
  };

  const home = () => {
    window.location.hash = "";
    setActive(null);
  };

  if (!active) return <Hub user={user} onOpen={open} onLogout={logout} />;
  if (active === "estoque") return <StockApp user={user} onLogout={logout} onHome={home} />;
  if (active === "tecnicos") return <TecnicosApp user={user} onLogout={logout} onHome={home} />;
  if (active === "testes") return <TestesApp user={user} onLogout={logout} onHome={home} />;
  return null;
}
