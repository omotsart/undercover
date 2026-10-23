import Markdown from "react-markdown";
import { api } from "./api";
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
      <section className="card instructions">
        {data ? (
          <Markdown>{data.text}</Markdown>
        ) : (
          <p>{error ?? "Loading the instructions."}</p>
        )}
      </section>
    </main>
  );
}
