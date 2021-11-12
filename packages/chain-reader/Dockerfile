FROM node:14-alpine
ENV TZ utc

#ARG RELEASE_VERSION
RUN apk add --no-cache tini git
ENTRYPOINT ["/sbin/tini", "--", "massbit-chain-reader"]

#RUN npm i -g @massbit/chain-reader@${RELEASE_VERSION}
RUN npm i -g @massbit/chain-reader@0.2.0
WORKDIR /workdir
