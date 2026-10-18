import { NextRequest, NextResponse } from "next/server";
import { deposit, walletCheckout, walletSnapshot } from "@/lib/wallet";
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await walletSnapshot());}
export async function POST(r:NextRequest){try{const b=await r.json();if(b.action==="deposit"){const entry=await deposit(b.amount,b.idempotencyKey);return NextResponse.json({entry,wallet:await walletSnapshot()});}if(b.action==="checkout")return NextResponse.json({...(await walletCheckout(b)),wallet:await walletSnapshot()});throw Error("Unsupported wallet action.");}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Wallet operation failed."},{status:400});}}
