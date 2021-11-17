const {execSync} = require('child_process');

module.exports = ({projectPath}) => {
  runCmd(projectPath, `npm install & npm run build`);
};

function runCmd(srcDir, cmd) {
  try {
    return execSync(cmd, {cwd: srcDir, stdio: 'ignore'});
  } catch (e) {
    // parentPort.postMessage(`failed to run command \`${cmd}\``);
  }
}
