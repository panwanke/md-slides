import pytest
from click.testing import CliRunner
import json

from jc_slide_studio.cli import main
from jc_slide_studio import __version__, __protocol_version__


def test_cli_doctor_text():
    runner = CliRunner()
    result = runner.invoke(main, ["doctor"])
    assert result.exit_code == 0
    assert "jc-slide-studio" in result.output
    assert "Status: OK" in result.output


def test_cli_doctor_json():
    runner = CliRunner()
    result = runner.invoke(main, ["doctor", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["ok"] is True
    assert data["protocolVersion"] == __protocol_version__
    assert data["version"] == __version__
