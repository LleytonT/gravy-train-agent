import { AppShell } from "@/components/product/app-shell";

export default function SecureAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
