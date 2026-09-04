export type Role = "admin" | "operador";

export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
};

export type Part = {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  location: string;
  quantity: number;
  minimum_stock: number;
  notes: string;
  active: number;
};

export type Movement = {
  id: number;
  part_id: number;
  order_id: number | null;
  type: "ENTRADA" | "SAIDA";
  quantity: number;
  previous_balance: number;
  new_balance: number;
  reason: string;
  responsible: string;
  notes: string;
  created_at: string;
  code: string;
  part_name: string;
  unit: string;
};

export type Order = {
  id: number;
  number: string;
  type: "ENTRADA" | "SAIDA";
  reason: string;
  responsible: string;
  notes: string;
  created_at: string;
  item_count: number;
  total_quantity: number;
};

export type Member = { id: number; name: string; role: Role };
export type Reason = { reason: string; occurrences: number; quantity: number };

export type Data = {
  parts: Part[];
  movements: Movement[];
  orders: Order[];
  members: Member[];
  reasons: Reason[];
};
