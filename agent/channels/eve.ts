import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL.
    localDev(),
    // Admit anonymous browser chat for the web UI.
    // Swap this for Clerk / Auth.js / a custom AuthFn when you want real user auth.
    none(),
  ],
});
