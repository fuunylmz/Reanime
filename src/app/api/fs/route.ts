import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    let targetDir = searchParams.get('path');

    if (!targetDir) {
        targetDir = os.platform() === 'win32' ? 'C:\\' : os.homedir();
    }

    try {
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
        const directories = entries
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        return NextResponse.json({
            success: true,
            currentPath: targetDir,
            directories: directories.sort()
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
