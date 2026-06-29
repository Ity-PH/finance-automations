import { QueryProvider } from "@/components/providers/QueryProvider";
import { SoaBreakdownCredentialProvider } from "@/components/providers/SoaBreakdownCredentialProvider";

export default function SoaBreakdownLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <SoaBreakdownCredentialProvider>{children}</SoaBreakdownCredentialProvider>
    </QueryProvider>
  );
}
