# Sandbox container image.
#
# IMPORTANT: the tag here must match the @cloudflare/sandbox npm version you
# installed. After `npm install`, check it with:
#   node -p "require('@cloudflare/sandbox/package.json').version"
# and set the tag below to that exact version.
#
# The base image ships Node.js + npm (plus python), which is what we need to run
# the generated plugin's `npm install && npm test` verification loop.
FROM docker.io/cloudflare/sandbox:0.12.1
