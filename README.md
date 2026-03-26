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
2. Load your own profile and job JSON files, or use the sample data. The two samples contain the full JSON structure, for which the recommended use case is to feed them into an LLM and provide it with your background, projects, skills, education, or whatever else you want displayed on your CV, and use the LLM to format it appropriately. The job JSON file can be built in a similar way, by either providing a URL or copy-pasting text of a job description and using the LLM to format it.
3. Review the generated sections and included items.
4. Adjust the headline, summary, template, and section selection.
5. Print from the browser to save the final CV as PDF.

## Tests

```bash
py -m unittest
```
