FROM node:14-alpine
ENV TZ utc

#ARG RELEASE_VERSION
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--", "massbit-query"]

RUN npm i -g @massbit/query@0.3.0
WORKDIR /workdir
