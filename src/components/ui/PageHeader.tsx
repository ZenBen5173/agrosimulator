"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  transparent?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  hideBack?: boolean;
}

export default function PageHeader({ title, onBack, action, transparent, breadcrumbs, hideBack }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={`sticky top-0 z-30 px-4 ${
        transparent
          ? "bg-transparent"
          : "border-b border-gray-100 bg-white/90 backdrop-blur-lg"
      }`}
    >
      {/* Breadcrumb row */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 pt-2 pb-0.5 overflow-x-auto no-scrollbar">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight size={10} className="text-gray-300" />}
              {crumb.href ? (
                <button onClick={() => router.push(crumb.href!)} className="text-[10px] text-green-600 font-medium hover:underline">
                  {crumb.label}
                </button>
              ) : (
                <span className="text-[10px] text-gray-400 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Title row */}
      <div className={`flex items-center gap-3 ${breadcrumbs ? "h-10" : "h-14"}`}>
        {!hideBack && (
          <button
            onClick={onBack || (() => router.back())}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="text-gray-700" />
          </button>
        )}
        <h1 className="flex-1 text-sm font-semibold text-gray-900 truncate">
          {title}
        </h1>
        {action && <div className="flex items-center">{action}</div>}
      </div>
    </header>
  );
}
