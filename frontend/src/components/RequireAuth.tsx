import { Navigate, useLocation } from "react-router-dom";
import { Show } from "@clerk/react";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(loc.pathname)}`} replace />
      </Show>
    </>
  );
}
