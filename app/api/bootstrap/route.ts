import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { initialMovements, initialParts } from "../../../db/seed-data";
export async function POST(){
 try{
  if(await env.DB.prepare("SELECT value FROM app_meta WHERE key='backup_imported'").first()) return NextResponse.json({ok:true,alreadyImported:true});
  const stmts:D1PreparedStatement[]=[];
  for(const p of initialParts) stmts.push(env.DB.prepare("INSERT INTO parts (id,code,name,category,unit,location,quantity,minimum_stock,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(p.id,p.code,p.name,p.category,p.unit,p.location,p.quantity,p.minimumStock,p.notes,p.active,p.createdAt,p.updatedAt));
  for(const m of initialMovements) stmts.push(env.DB.prepare("INSERT INTO movements (id,part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)").bind(m.id,m.partId,m.type,m.quantity,m.previousBalance,m.newBalance,m.reason,m.responsible,m.notes,"Migração do portable",m.createdAt));
  stmts.push(env.DB.prepare("INSERT INTO team_members (name,role,active) VALUES ('Igor','admin',1),('Gustavo','admin',1)"));
  stmts.push(env.DB.prepare("INSERT INTO app_meta (key,value) VALUES ('backup_imported',datetime('now'))"));
  for(let i=0;i<stmts.length;i+=75) await env.DB.batch(stmts.slice(i,i+75));
  return NextResponse.json({ok:true,parts:initialParts.length,movements:initialMovements.length});
 }catch(error){console.error("bootstrap",error);return NextResponse.json({error:"Não foi possível importar o backup inicial."},{status:500});}
}
