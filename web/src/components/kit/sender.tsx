import { senderName } from "@/lib/counts";
import { cn } from "@/lib/utils";

// Soft tints so senders are told apart at a glance, as in Gmail. The same sender always gets the same one.
const TINTS = [
  "bg-[#ddefe4] text-[#1e5b3a] dark:bg-[#1d3a2b] dark:text-[#a6dfbf]",
  "bg-[#e8e1f5] text-[#4b3a73] dark:bg-[#2e2742] dark:text-[#cdbff0]",
  "bg-[#fbe3e0] text-[#8c2a1e] dark:bg-[#43231f] dark:text-[#f3b5ac]",
  "bg-[#f6e7d2] text-[#6b4510] dark:bg-[#3d2e17] dark:text-[#ecc98f]",
  "bg-[#dce7f7] text-[#23477a] dark:bg-[#1f2d44] dark:text-[#b2c9ef]",
  "bg-[#f2f2f4] text-[#43464d] dark:bg-[#2a2b30] dark:text-[#d4d5d9]",
];

function tintOf(sender: string) {
  let hash = 0;
  for (const ch of sender.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

// Addresses that say what the email is, not who sent it: deals@, orders@, no-reply@...
const GENERIC = /^(deals?|offers?|orders?|info|news|newsletters?|hello|hi|hey|no-?reply|do-?not-?reply|notifications?|notify|support|team|contact|updates?|mail|marketing|shop|store|billing|accounts?|alerts?|digest|promo(tions)?|sales|help|service)$/i;

const readable = (s: string) => s.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "Maya Chen <maya@x.com>" → "Maya Chen"; a bare address → the part before the @, readable. When that
 * part only says what the email is (deals@denimco.example), the name of the domain instead: "Denimco".
 */
export function displayName(sender: string) {
  const name = senderName(sender);
  if (!name.includes("@")) return name;
  const [local, domain = ""] = name.split("@");
  if (!GENERIC.test(local)) return readable(local);
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  // shop.co.uk → shop, mail.denimco.com → denimco
  const site = labels.length >= 3 && labels.at(-2)!.length <= 3 ? labels.at(-3) : labels.at(-2);
  return site ? readable(site) : readable(local);
}

/** The address alone, for the line under a name. */
export function addressOf(sender: string) {
  return sender.match(/<([^>]+)>/)?.[1] ?? (sender.includes("@") ? sender.trim() : "");
}

/** A round initial for the sender, like Gmail's. */
export function SenderAvatar({ sender, size = 40, className }: { sender: string; size?: number; className?: string }) {
  const initial = displayName(sender).trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", tintOf(sender), className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
