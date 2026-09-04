import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export async function POST(request:Request){
 try{
  const b=await request.json(); if(!b.code?.trim()||!b.name?.trim()) return NextResponse.json({error:"Código e nome são obrigatórios."},{status:400});
  const now=new Date().toISOString();
  const result=await env.DB.prepare("INSERT INTO parts (code,name,category,unit,location,quantity,minimum_stock,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)").bind(b.code.trim(),b.name.trim(),b.category?.trim()||"Geral",b.unit?.trim()||"UN",b.location?.trim()||"",Number(b.quantity)||0,Number(b.minimumStock)||0,b.notes?.trim()||"",now,now).run();
  return NextResponse.json({ok:true,id:result.meta.last_row_id});
 }catch(error){console.error("part-create",error);return NextResponse.json({error:"Código já existe ou os dados são inválidos."},{status:400});}
}
