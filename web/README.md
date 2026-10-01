# Oscar web app

The Oscar inbox, built with Next.js, Tailwind, shadcn/ui and Framer Motion. It
talks to the Oscar API, so start that first from the repo root:

```bash
.venv/bin/uvicorn oscar.api:app --reload
```

Then in this folder:

```bash
npm install
npm run dev
```

Open http://localhost:3000. Set `NEXT_PUBLIC_OSCAR_API` if the API isn't on
http://localhost:8000.
