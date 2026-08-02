# Issue tracker

Current tracker: local Markdown.

Agent-ready work lives in `docs/tickets/`. Each ticket states its dependencies, goal, interface, acceptance checks, and exclusions. `docs/tickets/README.md` is the dependency map.

Use local Markdown because this architecture reset was requested as repository documentation, not as external GitHub issue creation. If the owner chooses GitHub Issues later:

1. publish each ticket without changing its identifier,
2. preserve blocking edges,
3. update this file with the repository and label conventions, and
4. replace local ticket bodies with links only after publication is verified.

Pull requests are not an issue intake surface.
