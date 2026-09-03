import { NextResponse, NextRequest } from 'next/server';
import { CommonService } from '@/services/CommonService'; // Adjust the import path
import { FactoryType } from '@/types/FactoryType';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as FactoryType;

    try {
        if (type) {
            const data = await CommonService.fetchDataStrategy(type);
            return NextResponse.json(data);
        }else{
            return NextResponse.json({ error: 'Param not found' }, { status: 400 });
        }

    } catch (error) {
        return NextResponse.json({ error: 'Type does not exists' }, { status: 500 });
    }
}