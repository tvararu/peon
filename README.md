# Peon

Peon is being rewritten around an agent harness that plays World of
Warcraft 3.3.5a. More information will follow.

## Ways of working

Work reaches `main` in one of two modes. Both use a GitHub issue with
acceptance criteria, a `factory/<N>-<slug>` branch, and a pull request
that lands as one squash commit once `signoff/ci`, `factory/ci` and
`factory/review` are green.

- **Paired.** The maintainer works one item at a time with one interactive
  agent session. The agent opens the issue, scopes it with the maintainer,
  does the work and opens the pull request, then waits for the
  maintainer's review. Once the maintainer approves, the same agent runs
  the checks, posts the `factory/*` statuses and squash-merges. This is
  the current mode.
- **Factory.** Asynchronous: Orca automations pick up issues the
  maintainer moves to Ready on the project board. Workers open pull
  requests, reviewers check them and a merger lands them, while QA and a
  reaper run in the background. `mise factory pace pause` stops it.
  See [docs/factory.md](docs/factory.md).

## Documentation

- [AGENTS.md](AGENTS.md): the rules every agent follows here.
- [docs/harness.md](docs/harness.md): the Pi harness, the way to play.
- [docs/evals.md](docs/evals.md): the eval scenarios and how to grade them.
- [docs/testing.md](docs/testing.md): unit tests, Bun gotchas and live
  test characters.
- [docs/protocol.md](docs/protocol.md): protocol references and gotchas.
- [docs/factory.md](docs/factory.md): the dev factory.
- [docs/archive/](docs/archive/README.md): earlier designs and plans.
- [LICENSE](LICENSE): the GNU AGPL 3.0 licence.
