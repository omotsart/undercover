from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


class FailingModel(StubModel):
    """A stub model that fails its first calls, then gives its scripted replies."""

    failures: int = 0

    def _generate(self, *args, **kwargs):
        if self.failures:
            self.failures -= 1
            raise TimeoutError("The model timed out")
        return super()._generate(*args, **kwargs)


def tool_call(name, **args):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": name}])


def decide(claim_id, decision, payout):
    return tool_call(
        "record_decision",
        claim_id=claim_id,
        decision=decision,
        payout=payout,
        reason="The reason.",
        policy_section="3. Trip Delay",
    )


def stub(*replies):
    return StubModel(messages=iter(replies))


def steps(api, claim_id):
    return [step["text"] for step in api.get(f"/api/claims/{claim_id}/steps").json()]
