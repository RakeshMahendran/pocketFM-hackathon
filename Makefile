# Thin delegate. All real logic lives in tasks.py so Windows and POSIX boxes
# run the same code path. Add commands there, not here.

.PHONY: setup corpus score serial promote spinoff validate gate1 leak api demo test

PY ?= python

setup:
	$(PY) tasks.py setup

corpus:
	$(PY) tasks.py corpus

score:
	$(PY) tasks.py score

serial:
	$(PY) tasks.py serial --event $(EVENT)

promote:
	$(PY) tasks.py promote --char $(CHAR)

spinoff:
	$(PY) tasks.py spinoff --char $(CHAR)

validate:
	$(PY) tasks.py validate

gate1:
	$(PY) tasks.py gate1 --char $(or $(CHAR),jignesh)

leak:
	$(PY) tasks.py leak

api:
	$(PY) tasks.py api

demo:
	$(PY) tasks.py demo

test:
	$(PY) tasks.py test
