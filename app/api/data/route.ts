import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url=new URL(request.url), from=url.searchParams.get("from"), to=url.searchParams.get("to");
    const filter=from&&to?"WHERE m.created_at >= ? AND m.created_at < datetime(?, '+1 day')":"", args=from&&to?[from,to]:[];
    const [parts,movements,orders,members,reasons]=await env.DB.batch([
      env.DB.prepare("SELECT * FROM parts WHERE active=1 ORDER BY name COLLATE NOCASE"),
      env.DB.prepare(`SELECT m.*,p.code,p.name AS part_name,p.unit FROM movements m JOIN parts p ON p.id=m.part_id ${filter} ORDER BY m.created_at DESC,m.id DESC LIMIT 1000`).bind(...args),
      env.DB.prepare("SELECT o.*,COUNT(m.id) AS item_count,COALESCE(SUM(m.quantity),0) AS total_quantity FROM orders o LEFT JOIN movements m ON m.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500"),
      env.DB.prepare("SELECT * FROM team_members WHERE active=1 ORDER BY name"),
      env.DB.prepare("SELECT reason,COUNT(*) AS occurrences,SUM(quantity) AS quantity FROM movements WHERE type='SAIDA' GROUP BY reason ORDER BY quantity DESC LIMIT 12")
    ]);
    return NextResponse.json({parts:parts.results,movements:movements.results,orders:orders.results,members:members.results,reasons:reasons.results});
  } catch(error){console.error("data-load",error);return NextResponse.json({error:"Não foi possível carregar os dados."},{status:500});}
}
