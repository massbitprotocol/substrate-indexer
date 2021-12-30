// eslint-disable-next-line @typescript-eslint/no-var-requires
const {execSync} = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {parentPort} = require('worker_threads');

parentPort.on('message', (param) => {
  const {name, projectsDir, url} = param;
  execSync(`git clone ${url} ${name}`, {cwd: projectsDir, stdio: 'ignore'});
  parentPort.postMessage(true);
});
