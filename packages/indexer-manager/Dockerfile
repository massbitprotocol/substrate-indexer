
# production images
FROM node:14-alpine
ENV TZ utc

ARG RELEASE_VERSION
RUN apk add --no-cache tini git
ENTRYPOINT ["/sbin/tini", "--", "massbit-node"]

RUN npm i -g @massbit/indexer-manager@${RELEASE_VERSION}
WORKDIR /workdir

CMD ["-f","/app"]
