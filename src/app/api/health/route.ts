import { NextResponse } from 'next/server';
import { DATA_MODE } from '@/lib/api/config';
export function GET() {
  return NextResponse.json(
    { status: 'ok', application: 'maos-em-oracao', version: '1.0.0', dataMode: DATA_MODE },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
