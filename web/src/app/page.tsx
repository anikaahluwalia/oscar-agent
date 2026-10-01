import Image from "next/image";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 p-6">
      <Image src="/oscar.png" alt="Oscar" width={120} height={120} priority />
      <h1 className="text-3xl font-semibold tracking-tight">Oscar</h1>
      <p className="text-muted-foreground">Your inbox, looked after.</p>
    </main>
  );
}
