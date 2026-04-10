"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  transparent?: boolean;
}

export default function PageHeader({ title, onBack, action, transparent }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={`sticky top-0 z-30 flex h-14 items-center gap-3 px-4 ${
        transparent
          ? "bg-transparent"
          : "border-b border-gray-100 bg-white/90 backdrop-blur-lg"
      }`}
    >
      <button
        onClick={onBack || (() => router.back())}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Go back"
      >
        <ArrowLeft size={20} className="text-gray-700" />
      </button>
      <h1 className="flex-1 text-base font-semibold text-gray-900 truncate">
        {title}
      </h1>
      {action && <div className="flex items-center">{action}</div>}
    </header>
  );
}
