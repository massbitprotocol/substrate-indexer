FROM node:14 as builder
ARG RELEASE_VERSION
ENTRYPOINT [""]
RUN npm i -g --unsafe-perm @massbit/query@${RELEASE_VERSION}

FROM node:14-alpine
ENV TZ utc
RUN apk add --no-cache tini git
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/lib/node_modules/@massbit/query/bin/run"]
