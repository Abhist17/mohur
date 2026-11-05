import { NETWORK } from "@/lib/config";

export function NotDeployed() {
  return (
    <div className="wrap page">
      <div className="banner">
        No Mohur deployment found for <span className="mono">{NETWORK}</span>. Run the deploy scripts, then{" "}
        <span className="mono">npm run sync</span> in <span className="mono">web/</span>.
      </div>
    </div>
  );
}
