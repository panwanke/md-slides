import pytest
from click.testing import CliRunner
import json

from md_slide_studio.cli import main
from md_slide_studio import __version__, __protocol_version__


def test_cli_doctor_text():
    runner = CliRunner()
    result = runner.invoke(main, ["doctor"])
    assert result.exit_code == 0
    assert "md-slide-studio" in result.output
    assert "Status: OK" in result.output


def test_cli_doctor_json():
    runner = CliRunner()
    result = runner.invoke(main, ["doctor", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["ok"] is True
    assert data["protocolVersion"] == __protocol_version__
    assert data["version"] == __version__


def test_cli_check_passes_on_valid_fixture():
    result = CliRunner().invoke(main, ["check", "tests/fixtures/steps.md"])
    assert result.exit_code == 0
    assert "PASS" in result.output


def test_cli_check_strict_fails_with_nonzero_exit(tmp_path):
    deck = tmp_path / "deck.md"
    deck.write_text("# Slide without notes\n", encoding="utf-8")
    result = CliRunner().invoke(main, ["check", str(deck), "--strict"])
    assert result.exit_code == 1
    assert "FAIL" in result.output
    assert "no speaker notes" in result.output
