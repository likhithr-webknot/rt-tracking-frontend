import { useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { consumeSpaPathRedirect } from "../../utils/spaPathRedirect";

/** Recover deep links when edge nginx mistakenly proxies SPA paths to Webtrak. */
export default function SpaPathBootstrap() {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const spaPath = consumeSpaPathRedirect();
    if (spaPath) navigate(spaPath, { replace: true });
  }, [navigate]);

  return null;
}
