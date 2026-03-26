from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder="static")


@app.route("/")
def index() -> object:
    return send_from_directory(BASE_DIR, "cv_builder.html")


@app.route("/health")
def health() -> object:
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
