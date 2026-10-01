import Image from "next/image";
import { cn } from "@/lib/utils";

export function OscarAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/oscar-face.png"
      alt="Oscar"
      width={size}
      height={size}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
