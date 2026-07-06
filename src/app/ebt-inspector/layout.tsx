import { QueryProvider } from "@/components/providers/QueryProvider";

export default function EbtInspectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <QueryProvider>{children}</QueryProvider>;
}
