# RobinEdit — local Vite server
# Usage:
#   make          # install deps if needed, then start http://127.0.0.1:5173/
#   make start    # same as default
#   make install  # npm install only
#   make check    # ROM load / render selftest
#   make build    # production build into dist/

HOST ?= 127.0.0.1
PORT ?= 5173
NPM  ?= npm

.PHONY: all start install check build stop help

all: start

help:
	@echo "make start   - run the editor at http://$(HOST):$(PORT)/"
	@echo "make install - npm install"
	@echo "make check   - run the ROM selftest"
	@echo "make build   - production build"
	@echo "make stop    - kill whatever is on port $(PORT)"

node_modules/.package-lock.json: package.json package-lock.json
	$(NPM) install
	@touch $@

install:
	$(NPM) install

start: node_modules/.package-lock.json
	@echo "RobinEdit → http://$(HOST):$(PORT)/"
	$(NPM) run dev -- --host $(HOST) --port $(PORT)

check: node_modules/.package-lock.json
	$(NPM) run check

build: node_modules/.package-lock.json
	$(NPM) run build

stop:
	@-fuser -k $(PORT)/tcp 2>/dev/null || true
	@echo "stopped listeners on $(PORT) (if any)"
