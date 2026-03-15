'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const DEFAULT_ROOT_MARGIN = '240px';

interface ViewportGateProps {
    children: ReactNode;
    placeholder: ReactNode;
    className?: string;
    rootMargin?: string;
    onVisible?: () => void;
}

export default function ViewportGate({
    children,
    placeholder,
    className,
    rootMargin = DEFAULT_ROOT_MARGIN,
    onVisible,
}: ViewportGateProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);

    useEffect(() => {
        if (isNearViewport || !containerRef.current) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setIsNearViewport(true);
                        onVisible?.();
                        observer.disconnect();
                        break;
                    }
                }
            },
            { rootMargin }
        );

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, [isNearViewport, onVisible, rootMargin]);

    return (
        <div ref={containerRef} className={className}>
            {isNearViewport ? children : placeholder}
        </div>
    );
}
