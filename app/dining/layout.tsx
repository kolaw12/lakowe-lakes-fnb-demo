import { FnbProvider } from "@/components/fnb/FnbProvider";
export default function DiningLayout({ children }: { children: React.ReactNode }) { return <FnbProvider>{children}</FnbProvider>; }
