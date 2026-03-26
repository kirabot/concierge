from __future__ import annotations

import json
import unittest
from pathlib import Path

from app import app


BASE_DIR = Path(__file__).resolve().parents[1]


class CvBuilderAppTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def test_index_serves_main_page(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        body = response.get_data(as_text=True)
        self.assertIn("CV Builder", body)
        self.assertIn("/static/cv.builder.js", body)
        self.assertIn('id="templateSelect"', body)
        response.close()

    def test_health_endpoint(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"ok": True})

    def test_static_assets_and_examples_exist(self) -> None:
        for relative in [
            Path("static/cv.builder.js"),
            Path("static/cv.template.html"),
            Path("static/cv.noir.template.html"),
            Path("static/examples/profile.sample.json"),
            Path("static/examples/job.sample.json"),
        ]:
            self.assertTrue((BASE_DIR / relative).exists(), f"Missing {relative}")

    def test_sample_json_has_required_top_level_sections(self) -> None:
        profile = json.loads((BASE_DIR / "static/examples/profile.sample.json").read_text(encoding="utf-8"))
        job = json.loads((BASE_DIR / "static/examples/job.sample.json").read_text(encoding="utf-8"))

        self.assertEqual(
          set(profile),
          {"basics", "roles", "projects", "achievements", "skills", "education", "certifications", "links"},
        )
        self.assertEqual(
          set(job),
          {"target_role", "company", "summary", "must_have", "nice_to_have", "keywords", "focus", "constraints"},
        )
        self.assertGreaterEqual(len(profile["roles"]), 1)
        self.assertGreaterEqual(len(profile["basics"]["headlines"]), 1)
        self.assertGreaterEqual(len(job["must_have"]), 1)


if __name__ == "__main__":
    unittest.main()
