// eslint-disable-next-line @typescript-eslint/no-var-requires
const {execSync} = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {parentPort} = require('worker_threads');

parentPort.on('message', (param) => {
  execSync('npm install', {cwd: param, stdio: 'ignore'});
  execSync('npm run build', {cwd: param, stdio: 'ignore'});
  parentPort.postMessage(true);
});
