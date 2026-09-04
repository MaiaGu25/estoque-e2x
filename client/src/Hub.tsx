import { Archive, Boxes, Camera, LogOut, ShieldCheck } from "lucide-react";
import type { User } from "./types";

type AppId = "estoque" | "tecnicos" | "testes";

const APPS: { id: AppId; nome: string; descricao: string; icon: any }[] = [
  { id: "estoque", nome: "Estoque", descricao: "Peças, ordens, movimentações e relatórios do estoque geral.", icon: Boxes },
  { id: "testes", nome: "Central de Testes", descricao: "Registro de testes de máquinas com fotos e consulta de evidências.", icon: Camera },
  { id: "tecnicos", nome: "Estoque dos Técnicos", descricao: "Peças de bancada, configurações e montagem de máquinas.", icon: Archive },
];

export default function Hub({ user, onOpen, onLogout }: { user: User; onOpen: (id: AppId) => void; onLogout: () => void }) {
  const isAdmin = user.role === "admin";

  return (
    <div className="hub-screen">
      <header className="hub-header">
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>CENTRAL E2X</strong>
            <span>Escolha um sistema para continuar</span>
          </div>
        </div>
        <div className="hub-user">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>
              <ShieldCheck size={12} /> {isAdmin ? "Administrador" : "Operador"}
            </span>
          </div>
          <button className="icon-btn" title="Sair" onClick={onLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="hub-grid">
        {APPS.map(({ id, nome, descricao, icon: Icon }) => (
          <button key={id} className="hub-card" onClick={() => onOpen(id)}>
            <div className="hub-card-icon">
              <Icon size={28} />
            </div>
            <h2>{nome}</h2>
            <p>{descricao}</p>
          </button>
        ))}
      </main>
    </div>
  );
}
