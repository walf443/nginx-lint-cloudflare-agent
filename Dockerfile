# Sandbox container image.
#
# IMPORTANT: the tag here must match the @cloudflare/sandbox npm version you
# installed. After `npm install`, check it with:
#   npm ls @cloudflare/sandbox
# and set the tag below to that exact version. (That is also why the dependency
# is pinned exact in package.json rather than carrying a ^ range: a floating
# minor would silently drift away from this tag.)
#
# The base image ships Node.js + npm (plus python), which is what we need to run
# the generated plugin's `npm install && npm test` verification loop.
FROM docker.io/cloudflare/sandbox:0.12.3
