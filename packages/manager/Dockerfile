FROM node:14-alpine
ENV TZ utc

#ARG RELEASE_VERSION
RUN apk add --no-cache tini git
ENTRYPOINT ["/sbin/tini", "--", "massbit-manager"]

#RUN npm i -g @massbit/manager@${RELEASE_VERSION}
RUN npm i -g @massbit/manager@0.4.0
WORKDIR /workdir
