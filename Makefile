.PHONY: setup corpus score serial promote spinoff validate dev demo test

setup:
	python3 -m venv .venv && ./.venv/bin/pip install -q -r requirements.txt
	@echo "done. cp .env.example .env and add your key"

corpus:
	./.venv/bin/python -m src.discovery.run

score:
	./.venv/bin/python -m src.scoring.run

serial:
	./.venv/bin/python -m src.generation.serial --event $(EVENT)

promote:
	./.venv/bin/python -m src.generation.promote --char $(CHAR)

spinoff:
	./.venv/bin/python -m src.generation.spinoff --char $(CHAR)

validate:
	./.venv/bin/python -m src.validation.run

dev:
	./.venv/bin/uvicorn src.api.main:app --reload --port 8000

demo:
	OFFLINE=1 ./.venv/bin/python -m src.demo_seed

test:
	./.venv/bin/pytest -q
