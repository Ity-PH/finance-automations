"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Generate Notices", href: "/" },
  { label: "SOA Breakdown", href: "/soa-breakdown" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-6 border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`pb-3 text-sm font-medium transition-colors ${
              isActive
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
