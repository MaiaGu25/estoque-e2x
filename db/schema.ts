import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const parts = sqliteTable("parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Geral"),
  unit: text("unit").notNull().default("UN"),
  location: text("location").notNull().default(""),
  quantity: real("quantity").notNull().default(0),
  minimumStock: real("minimum_stock").notNull().default(0),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  type: text("type").notNull(),
  reason: text("reason").notNull(),
  responsible: text("responsible").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const movements = sqliteTable("movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: integer("part_id").notNull().references(() => parts.id),
  orderId: integer("order_id").references(() => orders.id),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  previousBalance: real("previous_balance").notNull(),
  newBalance: real("new_balance").notNull(),
  reason: text("reason").notNull(),
  responsible: text("responsible").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  role: text("role").notNull().default("admin"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
