const {execSync} = require('child_process');
const {parentPort} = require('worker_threads');

parentPort.on('message', (param) => {
  execSync('npm install', {cwd: param, stdio: 'inherit'});
  execSync('npm run build', {cwd: param, stdio: 'inherit'});
  parentPort.postMessage(true);
});
