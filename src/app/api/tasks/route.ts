import { NextResponse } from "next/server";
import { getSafeTasks } from "@/lib/queue";

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({ success: true, tasks: getSafeTasks() });
}
