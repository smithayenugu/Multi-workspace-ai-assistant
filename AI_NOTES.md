# AI_NOTES.md

## AI tools used

I used two AI coding agents across this build: **Cline** for the initial scaffolding and architecture (Node/Express backend, React/Vite frontend, Supabase/pgvector schema, the core RAG and tool-calling loops), and **Blackbox AI**, driven turn-by-turn in chat, for debugging and feature work once the app was running end-to-end. Cline had a standing system prompt (`ai-instructions/cline-initial-prompt.md`) specifying the stack and requirements up front. Blackbox AI had no standing prompt — that phase was me testing a feature in the browser, then telling it directly what was broken or what to build next; the real prompts from that session are the ones quoted below, not a paraphrased summary.

Roughly, I split it as: the agents wrote the routes, controllers, and boilerplate; I decided the architecture, ran every "should be fixed now" claim back through the actual app before accepting it, and pushed back when the first fix attempt wasn't good enough.

## Key decisions I made myself

**Workspace-relevance check on `save_task`, not just retrieval.** The isolation requirement in the brief is written around retrieval, but tool calls are a parallel path touching the same data. I tested what happens asking to "save the task to review my resume" while sitting in a workspace whose only document is an unrelated college rulebook. The first behavior was that the task saved anyway, since saving isn't a retrieval action. I pushed back — *"tasks also should not save no"* — and had the model check whether the task topic is actually supported by the active workspace's documents before calling the tool, refusing and telling the user to switch workspaces otherwise. This closes a version of the isolation gap that vector filtering alone doesn't cover.

**Task notifications send to both Slack and Discord automatically.** When a task is saved, the app notifies both webhooks if both are configured, rather than asking which platform to use.

**Diagnosing a webhook delivery failure down to a config-loading mismatch.** Task-completion notifications weren't reaching Slack/Discord even though `save_task` was firing correctly. Instead of accepting a guess, I asked Blackbox to add diagnostics rather than patch blind, and the root cause turned out to be the controller checking `process.env.DISCORD_WEBHOOK_URL` directly instead of the already-loaded `config.discordWebhookUrl` — so the webhook URLs were configured but never actually read. Small bug, but it's the kind that "looks fixed" from the code alone and only shows up when you actually watch for the message to arrive.

## The hardest bug

Asking "what is Graph Theory" against a workspace with a Discrete Mathematics PDF uploaded consistently returned "I don't know based on the uploaded documents" — with five source citations from the correct PDF attached to the refusal. That last detail is what made this confusing: the citations proved retrieval was pulling the right chunk, so the failure had to be downstream of retrieval, not in it.

I pushed back with the actual chunk content — *"it contains defination"* — pointing at a line that read "Graph Theory: Basic concepts, Isomorphisms and Subgraphs, Trees and Their Properties..." Blackbox's read was that this is a topic outline, not a definitional sentence, and the system prompt at the time only allowed answering when an explicit definition was present — so it was refusing correctly by the letter of its own instruction, just not usefully.

The first fix relaxed the prompt to let the model synthesize from context. I re-ran the identical question — same failure, same refusal. That told me the first relaxation hadn't gone far enough, not that the diagnosis was wrong. The second, more direct rewrite ("you may use the provided context to answer by interpreting and synthesizing the most relevant parts; only refuse if the context is empty or completely unrelated") actually fixed it, confirmed by re-running the same question again before moving on.

The lesson that stuck: a fix isn't done until you've re-run the exact original failing case yourself. "This should work now" is a hypothesis, not a result — the first attempt here genuinely looked reasonable and still didn't work.

Sample exchange from that session:
```
> what is Graph Theory
I don't know based on the uploaded documents. [5 sources cited]

> it contains defination
> it should answer every question
> [same question re-run]
I don't know based on the uploaded documents. [still failing after fix #1]
```

## What I'd improve with more time

- Stress-test the relaxed grounding rule against the opposite failure mode — now that the model synthesizes from partial context, I want to confirm it still refuses cleanly on a workspace with genuinely nothing relevant, rather than over-correcting toward always answering.
- Re-verify duplicate-upload idempotency end-to-end; it was added later in the process and deserves a dedicated re-test pass.
- Surface the observability data (latency, token counts, retrieval hit/miss) in the dashboard UI itself rather than only in the database.
- Exercise multi-step tool use (one tool call informing a second) end-to-end rather than just at the code level.
