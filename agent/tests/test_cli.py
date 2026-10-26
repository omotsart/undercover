import pytest

from agent import __main__ as cli
from backend import runs, worker


def test_one_named_claim(api, monkeypatch, capsys):
    monkeypatch.setattr(
        cli, "work_claim", lambda claim_id, thread_id: f"{claim_id} done"
    )
    assert cli.main(["CLM-1001"]) == 0
    assert capsys.readouterr().out == "CLM-1001 done\n"


def test_a_run_capped_at_a_number_of_claims(api, monkeypatch, capsys):
    def run_queue(run_id, cap):
        todo = {"content": "Work CLM-1001", "status": "in_progress"}
        runs.write_todos(run_id, [todo])
        runs.add_run_claim(run_id, "CLM-1001")
        runs.write_todos(run_id, [todo | {"status": "done"}])
        runs.end_run(run_id, "finished", "One claim worked.")

    monkeypatch.setattr(worker, "run_queue", run_queue)
    monkeypatch.setattr(cli, "POLL_SECONDS", 0.01)
    assert cli.main(["--cap", "1"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("Run 1 started, capped at 1 claims.\n")
    assert "Done: Work CLM-1001\n" in out
    assert out.endswith("\nRun finished. One claim worked.\n")
    with worker.lock:
        pass


def test_a_run_that_is_refused(api, capsys):
    runs.create_run(5)
    assert cli.main(["--cap", "5"]) == 1
    assert capsys.readouterr().out == "The queue is already being worked.\n"


@pytest.mark.parametrize("args", [[], ["--cap5"], ["CLM-1001", "--cap", "5"]])
def test_wrong_arguments_show_the_usage(args, capsys):
    with pytest.raises(SystemExit):
        cli.main(args)
    assert "usage: uv run -m agent" in capsys.readouterr().err
