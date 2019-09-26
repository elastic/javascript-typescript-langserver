#!/usr/bin/env bash

# This is currently build script stub. Will populate this file
# with the actual build/test steps later.

set -e

if [ $# -lt 1 ]; then
  echo "Nodejs version missing"
  exit 2
fi

NODE_VERSION=$1
CMD="
  yarn global add tsc
  yarn
  yarn build"

npm_cache="$HOME/.npm"
docker_npm_cache="/home/node/.npm"

# Build the docker image with Node.
docker build --pull --force-rm \
  --build-arg NODE_VERSION=$1 \
  -t code-lsp-javascript-typescript:node-$1 \
  ./test

NODE_VERSION=$1 docker run \
  -v "$(pwd):/code" \
  -v $npm_cache:$docker_npm_cache \
  code-lsp-javascript-typescript:node-$1 \
  /bin/bash -c $CMD
