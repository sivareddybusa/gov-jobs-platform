import { signOutAction } from "@/lib/auth/sign-out-action";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" fullWidth={false} className="px-3 py-1.5 text-sm">
        Log out
      </Button>
    </form>
  );
}
