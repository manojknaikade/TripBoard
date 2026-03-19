import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
    AUTHENTICATED_USER_ID_HEADER,
    AUTH_STATE_HEADER,
} from '@/lib/supabase/requestAuthHeaders';

export async function updateSession(request: NextRequest) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(AUTH_STATE_HEADER);
    requestHeaders.delete(AUTHENTICATED_USER_ID_HEADER);

    function buildNextResponse() {
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    let supabaseResponse = buildNextResponse();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = buildNextResponse();
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired
    const {
        data: { user },
    } = await supabase.auth.getUser();

    requestHeaders.set(AUTH_STATE_HEADER, '1');

    if (user?.id) {
        requestHeaders.set(AUTHENTICATED_USER_ID_HEADER, user.id);
    } else {
        requestHeaders.delete(AUTHENTICATED_USER_ID_HEADER);
    }

    const response = buildNextResponse();

    for (const cookie of supabaseResponse.cookies.getAll()) {
        response.cookies.set(cookie);
    }

    return response;
}
