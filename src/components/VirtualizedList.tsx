'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type VirtualizedListProps<T> = {
    items: T[];
    getItemKey: (item: T, index: number) => string | number;
    estimateHeight: (item: T, index: number) => number;
    renderItem: (item: T, index: number) => React.ReactNode;
    overscanPx?: number;
    className?: string;
    emptyFallback?: React.ReactNode;
};

const DEFAULT_OVERSCAN_PX = 900;

function findFirstVisibleIndex(offsets: number[], heights: number[], target: number) {
    let low = 0;
    let high = offsets.length - 1;
    let answer = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const bottom = offsets[mid] + heights[mid];

        if (bottom >= target) {
            answer = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    return answer;
}

function findLastVisibleIndex(offsets: number[], target: number) {
    let low = 0;
    let high = offsets.length - 1;
    let answer = offsets.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (offsets[mid] <= target) {
            answer = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return answer;
}

function MeasuredItem({
    index,
    top,
    onHeightChange,
    children,
}: {
    index: number;
    top: number;
    onHeightChange: (index: number, height: number) => void;
    children: React.ReactNode;
}) {
    const itemRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!itemRef.current) {
            return;
        }

        const element = itemRef.current;
        onHeightChange(index, element.getBoundingClientRect().height);

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) {
                return;
            }

            onHeightChange(index, entry.contentRect.height);
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, [index, onHeightChange]);

    return (
        <div
            ref={itemRef}
            style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
            }}
        >
            {children}
        </div>
    );
}

export default function VirtualizedList<T>({
    items,
    getItemKey,
    estimateHeight,
    renderItem,
    overscanPx = DEFAULT_OVERSCAN_PX,
    className,
    emptyFallback = null,
}: VirtualizedListProps<T>) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const [measuredHeights, setMeasuredHeights] = useState<Record<number, number>>({});
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(items.length - 1, 15) });

    const heights = useMemo(
        () => items.map((item, index) => measuredHeights[index] ?? estimateHeight(item, index)),
        [estimateHeight, items, measuredHeights]
    );

    const offsets = useMemo(() => {
        const nextOffsets: number[] = new Array(items.length);
        let runningOffset = 0;

        for (let index = 0; index < items.length; index += 1) {
            nextOffsets[index] = runningOffset;
            runningOffset += heights[index];
        }

        return nextOffsets;
    }, [heights, items.length]);

    const totalHeight = items.length === 0
        ? 0
        : offsets[offsets.length - 1] + heights[heights.length - 1];

    useEffect(() => {
        if (items.length === 0) {
            return;
        }

        const updateVisibleRange = () => {
            if (!containerRef.current) {
                return;
            }

            const rect = containerRef.current.getBoundingClientRect();
            const containerTop = rect.top + window.scrollY;
            const viewportTop = Math.max(0, window.scrollY - containerTop - overscanPx);
            const viewportBottom = window.scrollY + window.innerHeight - containerTop + overscanPx;
            const start = findFirstVisibleIndex(offsets, heights, viewportTop);
            const end = Math.min(
                items.length - 1,
                findLastVisibleIndex(offsets, viewportBottom)
            );

            setVisibleRange((currentRange) => {
                if (currentRange.start === start && currentRange.end === end) {
                    return currentRange;
                }

                return { start, end };
            });
        };

        const scheduleUpdate = () => {
            if (rafRef.current !== null) {
                return;
            }

            rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = null;
                updateVisibleRange();
            });
        };

        updateVisibleRange();
        window.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            window.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);

            if (rafRef.current !== null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [heights, items.length, offsets, overscanPx]);

    if (items.length === 0) {
        return <>{emptyFallback}</>;
    }

    const onHeightChange = (index: number, height: number) => {
        const roundedHeight = Math.max(1, Math.round(height));
        setMeasuredHeights((current) => (
            current[index] === roundedHeight
                ? current
                : {
                    ...current,
                    [index]: roundedHeight,
                }
        ));
    };

    const startIndex = Math.max(0, visibleRange.start);
    const endIndex = Math.min(items.length - 1, Math.max(visibleRange.end, startIndex));

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                position: 'relative',
                height: totalHeight,
            }}
        >
            {items.slice(startIndex, endIndex + 1).map((item, sliceIndex) => {
                const index = startIndex + sliceIndex;
                return (
                    <MeasuredItem
                        key={getItemKey(item, index)}
                        index={index}
                        top={offsets[index]}
                        onHeightChange={onHeightChange}
                    >
                        {renderItem(item, index)}
                    </MeasuredItem>
                );
            })}
        </div>
    );
}
