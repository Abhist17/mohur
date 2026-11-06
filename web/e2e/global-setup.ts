import { execSync } from "node:child_process";
import { join } from "node:path";

/** Fresh fork, deploy, demo index, demo fills, sync: the same script check-all.sh uses. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_FORK) return;
  execSync(`bash ${join(__dirname, "../../scripts/fork-up.sh")}`, { stdio: "inherit" });
}
