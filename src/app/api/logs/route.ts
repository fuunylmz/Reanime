import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearAllTasks } from "@/lib/queue";

export async function GET() {
  try {
    const logs = await prisma.processLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.processLog.deleteMany({});
    clearAllTasks();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
