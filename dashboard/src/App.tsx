import { Header } from "./components";
import { usePath } from "./hooks";
import { InstructionsPage } from "./InstructionsPage";
import { QueuePage } from "./QueuePage";
import "./styles.css";

export function App() {
  const path = usePath();
  return (
    <div className="page">
      <Header path={path} />
      {path === "/instructions" ? <InstructionsPage /> : <QueuePage />}
    </div>
  );
}
