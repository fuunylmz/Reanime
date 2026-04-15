import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const records = await prisma.processLog.findMany({
      where: { status: "SUCCESS", tmdbId: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    // Group by tmdbId
    const uniqueItemsMap = new Map<number, { id: number; name: string; fileCount: number; lastProcessed: Date }>();
    
    for (const record of records) {
      if (record.tmdbId) {
        if (!uniqueItemsMap.has(record.tmdbId)) {
          uniqueItemsMap.set(record.tmdbId, {
            id: record.tmdbId,
            name: record.tmdbName || "未知项目",
            fileCount: 0,
            lastProcessed: record.createdAt
          });
        }
        const item = uniqueItemsMap.get(record.tmdbId)!;
        item.fileCount += 1;
        if (record.createdAt > item.lastProcessed) {
          item.lastProcessed = record.createdAt;
        }
      }
    }

    return NextResponse.json({ success: true, items: Array.from(uniqueItemsMap.values()) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
