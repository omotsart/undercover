import type { Run } from "./api";
import { Card, RunChip, TodoChip } from "./components";

function Todos({ run }: Readonly<{ run: Run }>) {
  if (run.todos.length === 0)
    return (
      <p className="empty">
        {run.status === "running"
          ? "The agent is planning its work."
          : "The agent wrote no to-do list."}
      </p>
    );
  return (
    <ol className="todos" aria-label="To-do list">
      {run.todos.map((todo, index) => (
        <li key={`${String(index)}-${todo.content}`}>
          <TodoChip status={todo.status} />
          <span>{todo.content}</span>
        </li>
      ))}
    </ol>
  );
}

export function RunCard({
  run,
  error,
}: Readonly<{ run: Run | null | undefined; error?: string }>) {
  return (
    <Card title="The agent's run" className="run-card">
      {run === undefined && (
        <p className="empty">{error ?? "Loading the run."}</p>
      )}
      {run === null && <p className="empty">The agent hasn't run yet.</p>}
      {run && (
        <>
          <div className="run-head">
            <RunChip status={run.status} />
            <span className="num">Run {run.run_id}</span>
            <span className="count num">
              {run.claims.length} of {run.cap} claims started
            </span>
          </div>
          <Todos run={run} />
          {run.summary && <p className="run-summary">{run.summary}</p>}
        </>
      )}
    </Card>
  );
}
