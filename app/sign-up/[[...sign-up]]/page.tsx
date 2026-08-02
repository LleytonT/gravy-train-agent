import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_20%_20%,oklch(0.96_0.03_250),transparent_45%),radial-gradient(circle_at_80%_0%,oklch(0.95_0.04_160),transparent_40%),oklch(0.985_0.01_100)] px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Gravy Scout
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an account to start personalized role matching.
          </p>
        </div>
        <SignUp />
      </div>
    </main>
  );
}
