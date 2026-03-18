import EmailAuthPage from '@/components/auth/EmailAuthPage';

type AuthSearchParams = Promise<{
    next?: string | string[];
    error?: string | string[];
    message?: string | string[];
}>;

function readFirstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({
    searchParams,
}: {
    searchParams: AuthSearchParams;
}) {
    const params = await searchParams;

    return (
        <EmailAuthPage
            mode="signup"
            nextPath={readFirstParam(params.next) || '/dashboard'}
            initialError={readFirstParam(params.error) || null}
            initialMessage={readFirstParam(params.message) || null}
        />
    );
}
