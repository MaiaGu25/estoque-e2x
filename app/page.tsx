import { headers } from "next/headers";
import StockApp from "./stock-app";
export const dynamic = "force-dynamic";
export default async function Home(){
 const h=await headers(), email=h.get("oai-authenticated-user-email");
 const encoded=h.get("oai-authenticated-user-full-name");
 const name=encoded&&h.get("oai-authenticated-user-full-name-encoding")==="percent-encoded-utf-8"?decodeURIComponent(encoded):null;
 return <StockApp currentUser={name||email||"Administrador"} />;
}
