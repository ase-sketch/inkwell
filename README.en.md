# Inkwell

**A novel-writing companion agent — Socratic questioning to help authors think through settings and plots. It never ghostwrites the prose.**

Inkwell is forked from [neuro-book](https://github.com/notnotype/neuro-book) (base commit 4590627, one-time import, not tracking upstream). It reuses the agent runtime, writing-engineering trio (World Engine / promise ledger / llmlint) and the editor, with changes focused on four areas: interview profile, session gate, author UI shell, and a reading module. Local web app (Nuxt 4 + Bun), distributed as a Windows portable zip.



## Development

```powershell
bun install
bun run --cwd packages/neuro-book dev   # http://127.0.0.1:3000/
```

First run on a fresh machine (inside `packages/neuro-book`):

```powershell
bun run migrate:deploy
bun run migrate:application-state -- --apply
```

## Packaging (Windows portable)

```powershell
bun run package:windows-portable   # produces neuro-book-windows-x64.zip
```

Or trigger `windows-portable.yml` manually in GitHub Actions.

## Docs

- Onboarding: [HANDOFF.md](HANDOFF.md) / [AGENTS.md](AGENTS.md) / [ARCHITECTURE.md](ARCHITECTURE.md)
- Specs & research: [docs/](docs/README.md)
- Decision notes: [.agents/notes/](.agents/notes/)

## License & Credits

[AGPL-3.0](LICENSE). See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for the upstream base and fork provenance.

[简体中文](README.md)
