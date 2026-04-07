"use client";

interface SkeletonProps {
  className?: string;
}

export function SkeletonLine({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 ${className}`}
    />
  );
}

export function SkeletonCircle({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-full bg-gray-200 ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-2xl bg-gray-100 p-4 ${className}`}>
      <div className="mb-3 h-3 w-1/3 rounded bg-gray-200" />
      <div className="mb-2 h-6 w-2/3 rounded bg-gray-200" />
      <div className="h-3 w-1/2 rounded bg-gray-200" />
    </div>
  );
}
