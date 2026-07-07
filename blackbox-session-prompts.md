# Blackbox AI session — real transcript excerpts

I didn't give Blackbox AI a standing system prompt or rules file — this phase was driven
turn-by-turn in chat: test a feature in the browser, then tell it directly what was wrong
or what to build next. Below are genuine excerpts from that session, in order, lightly
trimmed for length (not paraphrased or narrated). This is the closest thing I have to an
instruction file for this agent, so it's included as the deliverable rather than a
description of one.

---

## Bug 1: RAG grounding failure ("what is Graph Theory") — the hardest bug in the project

```
what is Graph Theory

I don't know based on the uploaded documents.

Sources:
📄 120b0029-e807-4099-95db-b1168fc8431b.pdf
📄 120b0029-e807-4099-95db-b1168fc8431b.pdf
📄 120b0029-e807-4099-95db-b1168fc8431b.pdf
📄 120b0029-e807-4099-95db-b1168fc8431b.pdf
📄 120b0029-e807-4099-95db-b1168fc8431b.pdf
```

Blackbox's diagnosis at this point: *"You're right that the chunk contains a 'Graph
Theory: Basic concepts...' line, but your current Gemini system prompt only allows
answering when the exact needed answer is present in the retrieved context. That line is
a topic/outline, not a full definitional paragraph, so Gemini often refuses to synthesize
and instead triggers the fallback."*

First fix attempt — relaxed the prompt to allow synthesis from context. I re-ran the
identical question:

```
it should answer every question

[re-ran the same question]
I don't know based on the uploaded documents.
```

Still failing — meaning the first relaxation hadn't gone far enough. The prompt at that
point read:

```
- You may use the provided context to answer by interpreting and synthesizing the most
  relevant parts.
- Only if the retrieved context is empty or completely unrelated, respond with:
  "I don't know based on the uploaded documents."
```

That version, tested again against the same question, worked. The lesson: retrieval was
never the problem (the citations proved the right chunk was being retrieved every time)
— it was the instruction layer being too conservative, and the first fix attempt looked
reasonable but wasn't strong enough until verified against the original failing case a
second time.

---

## Bug 2: Slack/Discord notifications silently not sending

```
Slack/Discord notifications still didn't arrive even though save_task is being produced.

blackbox has a question:
Do you want me to add diagnostic logs to server/src/controllers/chatController.js that
print (never the webhook URL itself): whether DISCORD_WEBHOOK_URL is set, whether
SLACK_WEBHOOK_URL is set, and the result/error from send_workspace_summary when
save_task succeeds?

i need proper functioning of slack message sending
```

Root cause, once instrumented: the controller was checking `process.env.DISCORD_WEBHOOK_URL`
/ `process.env.SLACK_WEBHOOK_URL` directly instead of the already-loaded
`config.discordWebhookUrl` / `config.slackWebhookUrl` — so the webhook URLs were
correctly configured in `.env` but never actually read by the code path that used them.
Fixed by switching both checks to the config object and adding explicit success/failure
logging so a future silent failure would be visible immediately instead of requiring
another diagnostic round.

---

## Decision: On tool-calling behavior (Slack/Discord "both" support)

```
no when i want to save it should save in both slack and discord
```

This was pushback on Blackbox trying to silently execute a single-platform delivery. I forced the tool schema and backend handler to explicitly accept a multi-platform distribution model, processing both webhooks automatically if both are present in the environment configuration.

---

## An unrelated tangent (not pursued further)

```
what happens clicking red button
it is in the pdf
Clicking the red button → box turns red
```

A PDF-viewer UI question that needed a screenshot to actually diagnose. I didn't follow
up on this, so it isn't part of the shipped feature set — noting it here only because
it's part of the real, unedited session rather than because it went anywhere.
