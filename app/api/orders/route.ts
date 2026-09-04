import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export async function POST(request:Request){
 try{
  const b=await request.json(); if(!["ENTRADA","SAIDA"].includes(b.type)||!b.reason?.trim()||!b.responsible?.trim()||!Array.isArray(b.items)||!b.items.length) return NextResponse.json({error:"Preencha tipo, motivo, responsável e itens."},{status:400});
  const now=new Date().toISOString(), number=`${b.type==="ENTRADA"?"ENT":"OS"}-${now.slice(0,10).replaceAll("-","")}-${String(Date.now()).slice(-5)}`;
  const order=await env.DB.prepare("INSERT INTO orders (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(number,b.type,b.reason.trim(),b.responsible.trim(),b.notes?.trim()||"",b.createdBy||b.responsible,now).run(), orderId=Number(order.meta.last_row_id);
  for(const item of b.items){
   const qty=Number(item.quantity); if(!Number.isFinite(qty)||qty<=0) throw new Error("Quantidade inválida");
   const part=await env.DB.prepare("SELECT id,quantity FROM parts WHERE id=? AND active=1").bind(Number(item.partId)).first<{id:number;quantity:number}>(); if(!part) throw new Error("Peça não encontrada");
   const next=b.type==="ENTRADA"?part.quantity+qty:part.quantity-qty; if(next<0) throw new Error("Saldo insuficiente");
   const changed=await env.DB.prepare("UPDATE parts SET quantity=?,updated_at=? WHERE id=? AND quantity=?").bind(next,now,part.id,part.quantity).run(); if(!changed.meta.changes) throw new Error("O saldo mudou durante a operação. Tente novamente.");
   await env.DB.prepare("INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(part.id,orderId,b.type,qty,part.quantity,next,b.reason.trim(),b.responsible.trim(),b.notes?.trim()||"",b.createdBy||b.responsible,now).run();
  }
  return NextResponse.json({ok:true,number});
 }catch(error){console.error("order-create",error);return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível registrar a ordem."},{status:400});}
}
