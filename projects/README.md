# projects

One directory per project, named by slug, each registered in `.stygian.yml`
under `projects:`. Bootstrap by copying `_template/`:

```bash
cp -R projects/_template projects/<name>
```

These directories hold the paper trail, never the code. The application ships
from the repository root — `app/`, `components/`, `utils/` — and
`projects/<name>/development/` holds how it got there, never a second copy of
it.
