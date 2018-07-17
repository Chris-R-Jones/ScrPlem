
default: pyenv

pyenv:
	python3 -m venv pyenv
	bash -c "source pyenv/bin/activate && pip install --upgrade pip requests"

getSource:
	bash -c "source pyenv/bin/activate && python scripts/GetSource.py"

postSource:
	bash -c "source pyenv/bin/activate && python scripts/PostSource.py"

