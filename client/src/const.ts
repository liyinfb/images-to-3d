export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  // In local auth mode: either VITE_LOCAL_AUTH is explicitly set,
  // or the OAuth portal URL is missing/empty (Docker Compose without OAuth).
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (
    import.meta.env.VITE_LOCAL_AUTH === "true" ||
    !oauthPortalUrl ||
    !appId
  ) {
    return "/login";
  }

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch {
    // Fallback to local login if URL construction fails for any reason
    return "/login";
  }
};
