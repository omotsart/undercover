import Markdown from "react-markdown";
import { api } from "./api";
import { Card } from "./components";
import { usePolling } from "./hooks";

export function InstructionsPage() {
  const { data, error } = usePolling(api.getInstructions, 60000);
  return (
    <main className="stack">
      <div className="title-row">
        <div className="title">
          <h1>Instructions</h1>
          <span className="count">The UnderCover Agent's, read only</span>
        </div>
      </div>
      {data ? (
        data.map((instructions) => (
          <Card
            key={instructions.name}
            title={instructions.title}
            className="instructions"
          >
            <Markdown>{instructions.text}</Markdown>
          </Card>
        ))
      ) : (
        <p className="card">{error ?? "Loading the instructions."}</p>
      )}
    </main>
  );
}
