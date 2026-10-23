import { ClaimPage } from "./ClaimPage";
import { Header } from "./components";
import { usePath } from "./hooks";
import { InstructionsPage } from "./InstructionsPage";
import { QueuePage } from "./QueuePage";
import "./styles.css";

function Page({ path }: Readonly<{ path: string }>) {
  const claimId = /^\/claims\/([^/]+)$/.exec(path)?.[1];
  if (claimId) return <ClaimPage key={claimId} claimId={claimId} />;
  if (path === "/instructions") return <InstructionsPage />;
  return <QueuePage />;
}

export function App() {
  const path = usePath();
  return (
    <div className="page">
      <Header path={path} />
      <Page path={path} />
    </div>
  );
}
