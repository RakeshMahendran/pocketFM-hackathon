# Thin delegate. All real logic lives in tasks.py so Windows and POSIX boxes
# run the same code path. Add commands there, not here.

.PHONY: setup corpus score serial cast promote spinoff validate gate1 leak ingest api demo test

PY ?= python

# The golden path. Override on the command line: make gate1 CHAR=savithri
STORY ?= story1_denied_identity
CHAR ?= ratnamma

setup:
	$(PY) tasks.py setup

corpus:
	$(PY) tasks.py corpus

score:
	$(PY) tasks.py score

serial:
	$(PY) tasks.py serial --event $(EVENT)

cast:
	$(PY) tasks.py cast --story $(STORY)

promote:
	$(PY) tasks.py promote --story $(STORY) --char $(CHAR)

spinoff:
	$(PY) tasks.py spinoff --story $(STORY) --char $(CHAR)

validate:
	$(PY) tasks.py validate --story $(STORY) --char $(CHAR)

gate1:
	$(PY) tasks.py gate1 --story $(STORY) --char $(CHAR)

leak:
	$(PY) tasks.py leak --story $(STORY) --char $(CHAR)

# No --story: the filter defaults to every story that has artifacts on disk,
# which is what you want after a run. `make ingest ARGS=--check` for the preflight.
ingest:
	$(PY) tasks.py ingest $(ARGS)

api:
	$(PY) tasks.py api

demo:
	$(PY) tasks.py demo --story $(STORY) --char $(CHAR)

test:
	$(PY) tasks.py test
