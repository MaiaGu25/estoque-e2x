import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { api } from "./api";
import type { User } from "./types";

export default function UsersPanel({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ users: User[] }>("/api/users");
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (u: User) => {
    if (u.id === currentUser.id) return;
    if (u.active && !confirm(`Desativar o acesso de ${u.name}?`)) return;
    await api.patch(`/api/users/${u.id}`, { active: !u.active });
    load();
  };

  const changeRole = async (u: User, role: "admin" | "operador") => {
    await api.patch(`/api/users/${u.id}`, { role });
    load();
  };

  return (
    <section>
      <div className="toolbar">
        <div />
        <button className="primary" onClick={() => setShowCreate(true)}>
          <Plus size={17} /> Novo usuário
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>Papel</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  {u.id === currentUser.id && <small> (você)</small>}
                </td>
                <td>{u.username}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value as "admin" | "operador")} disabled={u.id === currentUser.id}>
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td>
                  <span className={u.active ? "status ok" : "status warn"}>{u.active ? "Ativo" : "Inativo"}</span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="icon-btn" title="Redefinir senha" onClick={() => setResetTarget(u)}>
                    <KeyRound size={16} />
                  </button>
                  <button className="icon-btn" title={u.active ? "Desativar" : "Reativar"} onClick={() => toggleActive(u)} disabled={u.id === currentUser.id}>
                    {u.active ? <UserX size={16} /> : <UserCheck size={16} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !users.length && <p className="cart-empty">Nenhum usuário cadastrado.</p>}
      </div>
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => {
            setResetTarget(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operador">("operador");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/users", { username, name, password, role });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>Novo usuário</h2>
            <p>A pessoa vai precisar trocar essa senha no primeiro acesso.</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <ShieldCheck />
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Usuário (login)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
          </label>
          <label className="field">
            <span>Senha temporária</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
          </label>
          <label className="field">
            <span>Papel</span>
            <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "operador")}>
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={saving || !username || !name || password.length < 6} onClick={save}>
            {saving ? "Criando…" : "Criar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/users/${user.id}`, { newPassword: password });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>Redefinir senha — {user.name}</h2>
            <p>A pessoa vai precisar trocar essa senha no próximo acesso.</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <ShieldCheck />
          </button>
        </div>
        <label className="field">
          <span>Nova senha temporária</span>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
        </label>
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={saving || password.length < 6} onClick={save}>
            {saving ? "Salvando…" : "Redefinir"}
          </button>
        </div>
      </div>
    </div>
  );
}
