# Concierge

Small local CV builder for tailoring a resume to a specific role.

The app serves a browser UI where you can:

- load a profile JSON and a job JSON
- use bundled sample JSON as a starting point
- generate a tailored draft with selectable sections and items
- switch between bundled templates
- print the final result to PDF from the browser

## Requirements

- Python 3.10+
- `pip`

## Setup

```bash
py -m pip install -r requirements.txt
```

## Run

```bash
py app.py
```

Then open `http://localhost:8000`.

## Project Layout

- `app.py`: Flask entrypoint and static file server
- `cv_builder.html`: main UI shell
- `static/cv.builder.js`: client-side validation, matching, scoring, and preview logic
- `static/cv.template.html`: default CV template
- `static/cv.noir.template.html`: alternate template
- `static/examples/profile.sample.json`: bundled sample profile
- `static/examples/job.sample.json`: bundled sample job description
- `tests/test_app.py`: basic app and asset checks

## Workflow

1. Start the app.
2. Load your own profile and job JSON files, or use the sample data.
3. Review the generated sections and included items.
4. Adjust the headline, summary, template, and section selection.
5. Print from the browser to save the final CV as PDF.

## Tests

```bash
py -m unittest
```

## Local-Only Files

These are intentionally ignored and are not part of the repository:

- `output/`
- `profile.master.json`
- `profile.master.additions.json`
- `wsp.json`
